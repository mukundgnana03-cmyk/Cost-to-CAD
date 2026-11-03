"""Browser-only Netlify smoke test; no Python CAD backend is used."""

import argparse
import re
import hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:5175")
parser.add_argument("--chromium", default="/usr/bin/chromium")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=args.chromium,
        headless=True,
        args=["--no-sandbox", "--enable-unsafe-swiftshader"],
    )
    page = browser.new_page(viewport={"width": 1440, "height": 1080})
    errors = []
    api_requests = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on(
        "request", lambda r: api_requests.append(r.url) if "/api/" in r.url else None
    )
    page.goto(args.url)
    page.get_by_role("button", name="Try sample part", exact=True).click()
    expect(page.locator(".metric").nth(3)).to_contain_text("45,587.257", timeout=90000)
    expect(page.locator(".gallery img")).to_have_count(4)
    expect(page.locator(".chips button")).to_have_count(4)
    assert "WEBGL" in page.locator("#play-0").inner_text()
    print("PASS: browser-generated sample, exact volume and four views", flush=True)
    sample = root / "samples/calibration_block.step"
    page.locator("input[type=file]").set_input_files(str(sample))
    expect(page.locator('[aria-label="Version history"] option')).to_have_count(
        2, timeout=90000
    )
    expect(page.locator(".metric").nth(3)).to_contain_text("24,000", timeout=10000)
    expect(page.locator(".metric").nth(4)).to_contain_text("5,200")
    assert [
        page.locator(".metric").nth(i).locator("strong").inner_text() for i in range(3)
    ] == ["20mm", "30mm", "40mm"]
    with page.expect_download() as original_download:
        page.get_by_role(
            "button", name="Download last selected original", exact=True
        ).click()
    original = original_download.value
    assert (
        hashlib.sha256(Path(original.path()).read_bytes()).digest()
        == hashlib.sha256(sample.read_bytes()).digest()
    )
    page.locator("#play-4").scroll_into_view_if_needed()
    page.get_by_role("button", name="Edges", exact=True).click()
    page.get_by_label("Select measured edge", exact=True).select_option(index=1)
    expect(page.locator(".selection-info")).to_contain_text("Edge selected")
    page.get_by_label("Modification instruction", exact=True).fill("fillet 1 mm")
    page.get_by_role("button", name="Apply modification", exact=True).click()
    expect(page.locator('[aria-label="Version history"] option')).to_have_count(
        3, timeout=90000
    )
    volume = float(
        re.match(
            r"[\d,.]+", page.locator(".metric").nth(3).locator("strong").inner_text()
        )[0].replace(",", "")
    )
    assert 23000 < volume < 24000, volume
    page.get_by_label("Version history", exact=True).select_option("1")
    expect(page.locator(".metric").nth(3)).to_contain_text("24,000")
    page.get_by_label("Version history", exact=True).select_option("2")
    page.locator("#play-4").scroll_into_view_if_needed()
    page.locator("canvas").click(position={"x": 360, "y": 240})
    expect(page.locator(".selection-info")).to_contain_text("Face selected")
    page.get_by_label("Modification instruction", exact=True).fill("machined")
    page.get_by_role("button", name="Apply modification", exact=True).click()
    expect(page.locator('[aria-label="Version history"] option')).to_have_count(
        4, timeout=90000
    )
    same_volume = float(
        re.match(
            r"[\d,.]+", page.locator(".metric").nth(3).locator("strong").inner_text()
        )[0].replace(",", "")
    )
    assert same_volume == volume
    with page.expect_download() as download:
        page.locator(".model-bar").get_by_role(
            "button", name="STEP", exact=True
        ).click()
    assert b"ISO-10303-21;" in Path(download.value.path()).read_bytes()[:4096]
    # Unsupported commands preserve existing results and do not create a version.
    page.get_by_label("Select measured edge", exact=True).select_option(index=1)
    page.get_by_label("Modification instruction", exact=True).fill("remove boss")
    page.get_by_role("button", name="Apply modification", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("No edit was made", timeout=10000)
    expect(page.locator('[aria-label="Version history"] option')).to_have_count(4)
    # Exercise the other advertised kernel operation on the original block.
    page.get_by_label("Version history", exact=True).select_option("1")
    page.get_by_label("Select measured edge", exact=True).select_option(index=1)
    page.get_by_label("Modification instruction", exact=True).fill("chamfer 1 mm")
    page.get_by_role("button", name="Apply modification", exact=True).click()
    expect(page.locator('[aria-label="Version history"] option')).to_have_count(
        5, timeout=90000
    )
    chamfer_volume = float(
        re.match(
            r"[\d,.]+", page.locator(".metric").nth(3).locator("strong").inner_text()
        )[0].replace(",", "")
    )
    assert 23000 < chamfer_volume < 24000
    with page.expect_download() as revised:
        page.locator(".model-bar").get_by_role(
            "button", name="STEP", exact=True
        ).click()
    page.locator("input[type=file]").set_input_files(
        {
            "name": "revised.step",
            "mimeType": "application/step",
            "buffer": Path(revised.value.path()).read_bytes(),
        }
    )
    expect(page.locator('[aria-label="Version history"] option')).to_have_count(
        6, timeout=90000
    )
    reimport_volume = float(
        re.match(
            r"[\d,.]+", page.locator(".metric").nth(3).locator("strong").inner_text()
        )[0].replace(",", "")
    )
    assert abs(chamfer_volume - reimport_volume) < 0.002
    page.screenshot(path="/tmp/form-netlify-workspace.png")
    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(500)
    assert not page.evaluate("document.documentElement.scrollWidth>innerWidth")
    other = browser.new_page()
    other.goto(args.url)
    expect(other.locator('[aria-label="Version history"]')).to_have_count(0)
    assert not errors, errors
    assert not api_requests, api_requests
    print(
        "PASS: real STEP upload, analytic dimensions/area/volume, precision fillet, preserved original/version, appearance, downloads, mobile layout, independent visitor sessions; zero backend API calls or JS errors",
        flush=True,
    )
    browser.close()
