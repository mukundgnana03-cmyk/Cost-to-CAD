import cadquery as cq
import hashlib
import math
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from backend.app import geometry, integrations, main
from scripts.generate_samples import generate


@pytest.fixture(scope="module")
def samples(tmp_path_factory):
    folder = tmp_path_factory.mktemp("samples")
    generate(folder)
    return folder


def test_analytic_measurements_and_bom(samples):
    block = geometry.load(samples / "calibration_block.step")
    a, m = geometry.analyze(block)
    assert (a["length"], a["width"], a["height"]) == pytest.approx((20, 30, 40))
    assert a["volume"] == pytest.approx(24000)
    assert a["surface_area"] == pytest.approx(5200)
    assert len(a["faces"]) == 6 and len(m["edges"]) == 12
    plate = geometry.load(samples / "mounting_plate.step")
    a, _ = geometry.analyze(plate)
    assert a["volume"] == pytest.approx(80 * 50 * 12 - 4 * math.pi * 4**2 * 12)
    assert len(a["holes"]) == 4 and all(
        h["diameter"] == pytest.approx(8) for h in a["holes"]
    )
    assert (
        geometry.assembly_bom(samples / "mounting_plate.step")["kind"] == "single-part"
    )
    bom = geometry.assembly_bom(samples / "fixture_assembly.step")
    assert len(geometry.load(samples / "fixture_assembly.step").Solids()) == 3
    assert bom["kind"] == "assembly" and sorted(
        x["quantity"] for x in bom["items"]
    ) == [1, 2]


def test_geometry_edits_and_identity(samples):
    shape = geometry.load(samples / "mounting_plate.step")
    a, _ = geometry.analyze(shape)
    result = geometry.modify(shape, a, "increase_hole", a["holes"][0]["id"], 12)
    revised, _ = geometry.analyze(result, a)
    with pytest.raises(ValueError, match="boundary"):
        geometry.modify(shape, a, "increase_hole", a["holes"][0]["id"], 100)
    assert result.Volume() == pytest.approx(
        shape.Volume() - math.pi * (6**2 - 4**2) * 12, rel=1e-5
    )
    assert any(h["diameter"] == pytest.approx(12) for h in revised["holes"])
    unchanged = {f["id"] for f in a["faces"]} & {f["id"] for f in revised["faces"]}
    assert len(unchanged) >= 3
    with pytest.raises(ValueError):
        geometry.modify(shape, a, "remove_boss", None, 1)
    block = geometry.load(samples / "calibration_block.step")
    a, _ = geometry.analyze(block)
    for op in ("fillet", "chamfer"):
        edited = geometry.modify(block, a, op, a["edges"][0]["id"], 1)
        assert edited.isValid() and edited.Volume() < block.Volume()
    with pytest.raises(ValueError):
        geometry.modify(block, a, "fillet", "stale", 1)


def wait(client, pid):
    for _ in range(400):
        p = client.get("/api/projects/" + pid).json()
        if p["status"] in ("ready", "error"):
            return p
        time.sleep(0.25)
    pytest.fail("Worker did not finish within 100 seconds")


def test_end_to_end_real_blender(samples, tmp_path, monkeypatch):
    monkeypatch.setattr(main, "ROOT", tmp_path)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    client = TestClient(main.app)
    payload = (samples / "mounting_plate.step").read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    r = client.post(
        "/api/projects",
        data={"primary": "part.step"},
        files=[("files", ("part.step", payload))],
    )
    assert r.status_code == 202
    pid = r.json()["id"]
    p = wait(client, pid)
    assert p["status"] == "ready", p
    vid = p["current_version"]
    url = f"/api/projects/{pid}/versions/{vid}"
    v = client.get(url).json()
    assert v["analysis"]["volume"] > 45000
    assert v["description"]["source"].startswith("geometry-only")
    for view in ("isometric", "front", "top", "side"):
        png = client.get(url + "/files/" + view + ".png")
        assert png.status_code == 200
        image = Image.open(__import__("io").BytesIO(png.content))
        assert image.size == (800, 650)
        # Orthographic planar faces are intentionally uniform; check model/background contrast.
        gray = image.convert("L")
        low, high = gray.getextrema()
        assert high - low > 40
    mesh = client.get(url + "/files/mesh.json").json()
    assert len(mesh["faces"]) == 10
    face = v["analysis"]["holes"][0]["id"]
    r = client.post(
        f"/api/projects/{pid}/edit",
        json={
            "version": vid,
            "message": "Increase hole diameter to 12 mm",
            "selected_id": face,
        },
    )
    assert r.status_code == 202
    p = wait(client, pid)
    assert p["status"] == "ready" and not p["error"], p
    assert len(p["versions"]) == 2 and p["current_version"] != vid
    new = client.get(f"/api/projects/{pid}/versions/{p['current_version']}").json()
    resized = next(h for h in new["analysis"]["holes"] if h["diameter"] > 10)
    oldhole = next(h for h in v["analysis"]["holes"] if h["id"] == face)
    assert resized["center"] == pytest.approx(oldhole["center"], abs=1e-5)
    assert new["parent"] == vid and new["analysis"]["volume"] < v["analysis"]["volume"]
    assert (
        hashlib.sha256(
            client.get(f"/api/projects/{pid}/originals/part.step").content
        ).hexdigest()
        == digest
    )
    assert client.get(url).json() == v
    assert (
        client.post(
            f"/api/projects/{pid}/edit", json={"version": vid, "message": "fillet 1 mm"}
        ).status_code
        == 409
    )
    current = p["current_version"]
    assert (
        client.post(
            f"/api/projects/{pid}/edit",
            json={"version": current, "message": "remove boss"},
        ).status_code
        == 202
    )
    p = wait(client, pid)
    assert p["error"] and len(p["versions"]) == 2
    # Appearance change creates a version and new Blender output without changing geometry.
    newface = new["analysis"]["faces"][0]["id"]
    client.post(
        f"/api/projects/{pid}/edit",
        json={"version": current, "message": "machined", "selected_id": newface},
    )
    p = wait(client, pid)
    assert not p["error"] and len(p["versions"]) == 3, p
    styled = client.get(f"/api/projects/{pid}/versions/{p['current_version']}").json()
    assert styled["appearance"][newface] == "machined"
    assert styled["analysis"]["volume"] == pytest.approx(new["analysis"]["volume"])


def test_validation_and_native_license(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "ROOT", tmp_path)
    monkeypatch.delenv("CATIA_CONVERTER", raising=False)
    client = TestClient(main.app)
    for name, data in [
        ("bad.exe", b"anything"),
        ("bad.step", b"not step"),
        ("../bad.step", b"ISO-10303-21;"),
    ]:
        assert (
            client.post(
                "/api/projects", data={"primary": name}, files=[("files", (name, data))]
            ).status_code
            == 400
        )
    with pytest.raises(ValueError, match="licensed"):
        integrations.native_convert(Path("x.CATPart"), Path("x.step"), [])
    p = client.post(
        "/api/projects",
        data={"primary": "p.CATPart"},
        files=[("files", ("p.CATPart", b"native test"))],
    ).json()
    assert "licensed" in wait(client, p["id"])["error"]
    assert client.get("/api/projects/not-an-id").status_code == 404


def test_gemini_protocol(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-only")
    seen = []

    def fake(parts):
        seen.extend(parts)
        return '{"operation":"fillet","value":1.5,"explanation":"round selected edge"}'

    monkeypatch.setattr(integrations, "gemini", fake)
    intent, source = integrations.interpret(
        "round this edge by 1.5 mm", "selection", dict(length=20, width=30, height=40)
    )
    assert source == "gemini" and intent.operation == "fillet" and intent.value == 1.5
    assert "selection" in seen[0]["text"]
    monkeypatch.setattr(
        integrations, "gemini", lambda _: '{"operation":"execute_code","value":1}'
    )
    with pytest.raises(ValueError):
        integrations.interpret("run code", None, dict(length=1, width=1, height=1))


def test_specified_material_roundtrip(tmp_path):
    from OCP.TDocStd import TDocStd_Document
    from OCP.TCollection import TCollection_ExtendedString, TCollection_HAsciiString
    from OCP.XCAFDoc import XCAFDoc_DocumentTool
    from OCP.STEPCAFControl import STEPCAFControl_Writer
    from OCP.STEPControl import STEPControl_AsIs

    doc = TDocStd_Document(TCollection_ExtendedString("test"))
    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    material_tool = XCAFDoc_DocumentTool.MaterialTool_s(doc.Main())
    label = shape_tool.AddShape(cq.Workplane("XY").box(10, 10, 10).val().wrapped)
    material_tool.SetMaterial(
        label,
        TCollection_HAsciiString("Aluminium 6061"),
        TCollection_HAsciiString("Specified alloy"),
        2.7,
        TCollection_HAsciiString("density"),
        TCollection_HAsciiString("g/cm3"),
    )
    assert geometry.material_for_label(label) == "Aluminium 6061"
    writer = STEPCAFControl_Writer()
    writer.SetMaterialMode(True)
    assert writer.Transfer(doc, STEPControl_AsIs)
    target = tmp_path / "material.step"
    assert int(writer.Write(str(target))) == 1
    assert geometry.assembly_bom(target)["items"][0]["material"] == "Aluminium 6061"


def test_openai_responses_adapter_and_multimodal_description(monkeypatch, tmp_path):
    import httpx

    monkeypatch.setenv("CAD_AI_API_KEY", "unit-test-only")
    monkeypatch.setenv("CAD_AI_MODEL", "gpt-6")
    requests = []
    original_client = httpx.Client

    def handle(request):
        import json

        data = json.loads(request.content)
        requests.append(data)
        assert str(request.url) == "https://api.openai.com/v1/responses"
        assert request.headers["Authorization"] == "Bearer unit-test-only"
        assert data["store"] is False and data["model"] == "gpt-6"
        assert data["text"]["format"]["type"] == "json_object"
        if data["input"][0]["content"][0]["text"].startswith("Interpret"):
            result = {
                "operation": "fillet",
                "value": 1.5,
                "explanation": "Round selected edge",
            }
        else:
            result = {
                "name": "Plate",
                "description": "A mounting plate",
                "geometric_characteristics": "Four cylindrical holes",
                "likely_function": "Mounting (assumption)",
                "features": ["Four holes"],
                "material": "Steel",
                "manufacturing_candidates": ["Milling (assumption)"],
            }
        return httpx.Response(
            200,
            json={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": json.dumps(result)}
                        ],
                    }
                ]
            },
        )

    monkeypatch.setattr(
        integrations.httpx,
        "Client",
        lambda **kwargs: original_client(
            transport=httpx.MockTransport(handle), **kwargs
        ),
    )
    intent, source = integrations.interpret(
        "round this edge by 1.5 mm", "edge-uuid", dict(length=80, width=50, height=12)
    )
    assert source == "openai" and intent.operation == "fillet" and intent.value == 1.5
    for view in ("isometric", "front", "top", "side"):
        Image.new("RGB", (4, 4)).save(tmp_path / (view + ".png"))
    a = dict(length=80, width=50, height=12, solid_count=1, holes=[])
    description = integrations.describe(
        tmp_path, "Plate", a, {"items": [{"material": None}]}
    )
    assert description["source"].startswith("openai")
    assert description["material"] is None  # Never adopt AI-invented material.
    content = requests[1]["input"][0]["content"]
    assert sum(block["type"] == "input_image" for block in content) == 4
    assert all(
        block["image_url"].startswith("data:image/png;base64,") for block in content[1:]
    )


def test_no_api_key_required(monkeypatch):
    for key in ("GEMINI_API_KEY", "CAD_AI_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    assert main.health()["ai_configured"] is False
    intent, source = integrations.interpret(
        "fillet 1 mm", "edge-id", dict(length=1, width=1, height=1)
    )
    assert intent.operation == "fillet" and source == "local-command"
