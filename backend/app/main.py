import json
import os
import re
import shutil
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import cadquery as cq
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from . import geometry, integrations

ROOT = Path(
    os.getenv("CAD_DATA_DIR", Path(__file__).resolve().parents[2] / "data")
).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
POOL = ThreadPoolExecutor(
    max_workers=1
)  # OpenCascade access serialized; production: isolated worker processes.
LOCK = threading.RLock()
app = FastAPI(title="FORM / CAD Engineering", version="0.1.0")


def write(path, data):
    with LOCK:
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(data, indent=2))
        temp.replace(path)


def project_path(pid):
    if not re.fullmatch(r"[0-9a-f]{32}", pid):
        raise HTTPException(404, "Project not found")
    path = ROOT / pid
    if not (path / "project.json").is_file():
        raise HTTPException(404, "Project not found")
    return path


def read_project(path):
    with LOCK:
        return json.loads((path / "project.json").read_text())


def update(path, **kwargs):
    data = read_project(path)
    data.update(kwargs)
    write(path / "project.json", data)


def render(folder):
    script = Path(__file__).with_name("render_blender.py")
    with (folder / "render.log").open("w") as log:
        completed = subprocess.run(
            [
                os.getenv("BLENDER_BIN", "blender"),
                "-b",
                "-t",
                "2",
                "--python-exit-code",
                "1",
                "--python",
                str(script),
                "--",
                str(folder),
            ],
            stdout=log,
            stderr=log,
            timeout=300,
        )
    if completed.returncode or not all(
        (folder / (v + ".png")).is_file() for v in ("isometric", "front", "top", "side")
    ):
        raise RuntimeError(
            "Blender rendering failed. Check server render.log and Blender installation."
        )


def build_version(
    path, shape, bom, name, parent=None, appearance=None, change="Original import"
):
    version = uuid.uuid4().hex
    folder = path / "versions" / version
    folder.mkdir(parents=True)
    previous = parent["analysis"] if parent else None
    cq.exporters.export(shape, str(folder / "model.step"))
    # Bind indices to the canonical STEP representation that future edits reload.
    shape = geometry.load(folder / "model.step")
    analysis, mesh = geometry.analyze(shape, previous)
    cq.exporters.export(shape, str(folder / "model.stl"), tolerance=0.15)
    valid_ids = {f["id"] for f in analysis["faces"]}
    appearance = {k: v for k, v in (appearance or {}).items() if k in valid_ids}
    manifest = dict(
        id=version,
        parent=parent["id"] if parent else None,
        created_at=datetime.now(timezone.utc).isoformat(),
        change=change,
        analysis=analysis,
        bom=bom,
        appearance=appearance,
        name=name,
    )
    write(folder / "mesh.json", mesh)
    write(folder / "manifest.json", manifest)
    update(
        path, status="rendering", message="Blender is rendering four engineering views"
    )
    render(folder)
    update(
        path, status="describing", message="Analyzing model metadata and rendered views"
    )
    try:
        manifest["description"] = integrations.describe(folder, name, analysis, bom)
    except Exception:
        # Geometry remains usable; do not silently report a failed AI integration as success.
        manifest["description"] = {
            "name": name,
            "description": "Geometry analyzed. AI description request failed.",
            "source": "unavailable",
            "features": [],
            "manufacturing_candidates": [],
            "material": None,
        }
        manifest["ai_warning"] = (
            "AI request failed. Check API credentials, model availability and network access."
        )
    write(folder / "manifest.json", manifest)
    return manifest


def complete(path, manifest):
    data = read_project(path)
    versions = data["versions"] + [manifest["id"]]
    update(
        path,
        status="ready",
        message="Model ready",
        current_version=manifest["id"],
        versions=versions,
        error=None,
    )


def process_upload(path, source, components):
    try:
        update(path, status="importing", message="Importing precise solid geometry")
        step = source
        if source.suffix.lower() in (".catpart", ".catproduct"):
            step = path / "converted.step"
            integrations.native_convert(source, step, components)
        shape = geometry.load(step)
        bom = geometry.assembly_bom(step)
        complete(path, build_version(path, shape, bom, source.stem))
    except Exception as exc:
        update(path, status="error", message="Import failed", error=str(exc))


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "kernel": "OpenCascade / CadQuery",
        "blender": bool(shutil.which(os.getenv("BLENDER_BIN", "blender"))),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "ai_configured": bool(integrations.ai_provider()),
        "ai_provider": integrations.ai_provider(),
        "ai_model": os.getenv("CAD_AI_MODEL", "gpt-6")
        if integrations.ai_provider() == "openai"
        else None,
        "catia_configured": bool(os.getenv("CATIA_CONVERTER")),
    }


@app.get("/api/projects")
def projects():
    return sorted(
        [read_project(p.parent) for p in ROOT.glob("*/project.json")],
        key=lambda p: p["created_at"],
        reverse=True,
    )


@app.post("/api/projects", status_code=202)
async def upload(files: list[UploadFile] = File(...), primary: str = Form(...)):
    if not files or len(files) > 100:
        raise HTTPException(400, "Upload 1–100 files")
    allowed = {".step", ".stp", ".catpart", ".catproduct"}
    names = [f.filename or "" for f in files]
    if len(set(names)) != len(names) or primary not in names:
        raise HTTPException(400, "Choose a unique primary file")
    for name in names:
        if (
            not name
            or "/" in name
            or "\\" in name
            or len(name) > 180
            or Path(name).suffix.lower() not in allowed
        ):
            raise HTTPException(
                400,
                "Only STEP, STP, CATPart and CATProduct files with plain filenames are accepted",
            )
    pid = uuid.uuid4().hex
    path = ROOT / pid
    (path / "originals").mkdir(parents=True)
    total = 0
    try:
        for file in files:
            destination = path / "originals" / file.filename
            with destination.open("wb") as handle:
                while chunk := await file.read(1024 * 1024):
                    total += len(chunk)
                    if total > 200 * 1024 * 1024:
                        raise HTTPException(413, "Combined upload exceeds 200 MB")
                    handle.write(chunk)
            if not destination.stat().st_size:
                raise HTTPException(400, "Empty file")
            if destination.suffix.lower() in (".step", ".stp"):
                with destination.open("rb") as handle:
                    header = handle.read(4096)
                if b"ISO-10303-21;" not in header:
                    raise HTTPException(
                        400, "File content is not a STEP exchange document"
                    )
        data = dict(
            id=pid,
            name=Path(primary).stem,
            status="queued",
            message="Waiting for geometry worker",
            created_at=datetime.now(timezone.utc).isoformat(),
            versions=[],
            current_version=None,
            original_files=names,
            error=None,
        )
        write(path / "project.json", data)
        POOL.submit(
            process_upload,
            path,
            path / "originals" / primary,
            [path / "originals" / n for n in names if n != primary],
        )
        return data
    except Exception:
        shutil.rmtree(path)
        raise


@app.get("/api/projects/{pid}")
def project(pid: str):
    return read_project(project_path(pid))


def version_data(pid, vid):
    path = project_path(pid)
    if vid not in read_project(path)["versions"]:
        raise HTTPException(404, "Version not found")
    folder = path / "versions" / vid
    return folder, json.loads((folder / "manifest.json").read_text())


@app.get("/api/projects/{pid}/versions/{vid}")
def version(pid: str, vid: str):
    return version_data(pid, vid)[1]


@app.get("/api/projects/{pid}/versions/{vid}/files/{filename}")
def artifact(pid: str, vid: str, filename: str):
    folder, _ = version_data(pid, vid)
    if filename not in (
        "mesh.json",
        "model.step",
        "model.stl",
        "isometric.png",
        "front.png",
        "top.png",
        "side.png",
    ):
        raise HTTPException(404)
    return FileResponse(
        folder / filename, filename=filename if filename.startswith("model.") else None
    )


@app.get("/api/projects/{pid}/originals/{filename}")
def original(pid: str, filename: str):
    path = project_path(pid)
    if filename not in read_project(path)["original_files"]:
        raise HTTPException(404)
    return FileResponse(path / "originals" / filename, filename=filename)


class Edit(BaseModel):
    version: str
    message: str = Field(min_length=1, max_length=2000)
    selected_id: str | None = None


def process_edit(path, request, parent):
    try:
        intent, source = integrations.interpret(
            request.message, request.selected_id, parent["analysis"]
        )
        if intent.operation == "unsupported":
            raise ValueError(
                intent.explanation
                or "This edit is unsupported; no version was created."
            )
        shape = geometry.load(path / "versions" / parent["id"] / "model.step")
        appearance = parent["appearance"].copy()
        if intent.operation in ("highlight", "machined"):
            if request.selected_id not in {
                f["id"] for f in parent["analysis"]["faces"]
            }:
                raise ValueError("Select a face for appearance edits.")
            appearance[request.selected_id] = intent.operation
        else:
            if intent.value is None:
                raise ValueError("Specify a positive dimension in millimeters.")
            if parent["bom"]["kind"] == "assembly":
                raise ValueError(
                    "Precision edits currently support single-part files. Assembly editing is unavailable."
                )
            shape = geometry.modify(
                shape,
                parent["analysis"],
                intent.operation,
                request.selected_id,
                intent.value,
            )
        manifest = build_version(
            path,
            shape,
            parent["bom"],
            parent["name"],
            parent,
            appearance,
            request.message,
        )
        manifest["interpretation"] = {"source": source, **intent.model_dump()}
        write(path / "versions" / manifest["id"] / "manifest.json", manifest)
        complete(path, manifest)
    except Exception as exc:
        update(
            path,
            status="ready",
            message="Edit rejected; previous version preserved",
            error=str(exc),
        )


@app.post("/api/projects/{pid}/edit", status_code=202)
def edit(pid: str, request: Edit):
    path = project_path(pid)
    with LOCK:
        data = read_project(path)
        if data["status"] != "ready":
            raise HTTPException(409, "Model is busy or unavailable")
        if data["current_version"] != request.version:
            raise HTTPException(
                409, "Selection is from a stale version. Select on the latest model."
            )
        _, parent = version_data(pid, request.version)
        update(
            path, status="editing", message="Validating requested operation", error=None
        )
        POOL.submit(process_edit, path, request, parent)
    return {"status": "editing"}


# Interrupted jobs are visible and recoverable through a new upload; never pretend they completed.
for metadata in ROOT.glob("*/project.json"):
    current = json.loads(metadata.read_text())
    if current["status"] not in ("ready", "error"):
        current.update(
            status="ready" if current.get("current_version") else "error",
            error="Previous worker was interrupted. Retry your edit or upload.",
            message="Worker interrupted",
        )
        write(metadata, current)


# Register after API routes: a single deployed service serves both the UI and CAD jobs.
def mount_web(application, directory):
    directory = Path(directory).resolve()
    if not (directory / "index.html").is_file():
        return
    assets = directory / "assets"
    if assets.is_dir():
        application.mount("/assets", StaticFiles(directory=assets), name="web-assets")

    @application.get("/{web_path:path}", include_in_schema=False)
    def web(web_path: str):
        if web_path == "api" or web_path.startswith("api/"):
            raise HTTPException(404, "API route not found")
        requested = (directory / web_path).resolve()
        if not requested.is_relative_to(directory):
            raise HTTPException(404)
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(directory / "index.html")


mount_web(
    app,
    os.getenv("CAD_WEB_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist"),
)
