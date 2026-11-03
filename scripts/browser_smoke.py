"""Optional UI integration test. Run with Playwright + Chromium and both dev servers up.
Example: python scripts/browser_smoke.py --chromium /usr/bin/chromium
"""

import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:5173")
parser.add_argument("--chromium", default=None)
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
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(args.url)
    page.wait_for_function("document.body.textContent.includes('OpenCascade engine')")
    assert len(page.locator("h2").all_text_contents()) == 5
    page.locator("input[type=file]").set_input_files(
        str(root / "samples/mounting_plate.step")
    )
    page.wait_for_function(
        "document.querySelectorAll('.gallery img').length === 4", timeout=180000
    )
    assert "45,587" in page.locator(".metrics").inner_text()
    page.locator(".chips button").first.click()
    assert "Face selected" in page.locator(".selection-info").inner_text()
    page.get_by_role(
        "button", name="Increase hole diameter to 12 mm", exact=True
    ).click()
    page.get_by_role("button", name="Send modification", exact=True).click()
    page.wait_for_function(
        "document.querySelector('[aria-label=\"Version history\"]')?.options.length === 2",
        timeout=180000,
    )
    page.wait_for_function(
        "document.querySelector('.metrics')?.textContent.includes('44,833')",
        timeout=10000,
    )
    assert "44,833" in page.locator(".metrics").inner_text()
    page.locator("#section-4").scroll_into_view_if_needed()
    page.wait_for_timeout(1500)
    canvas = page.locator("canvas")
    canvas.click(position={"x": 360, "y": 240})
    assert "Face selected" in page.locator(".selection-info").inner_text()
    page.get_by_role("button", name="Edges", exact=True).click()
    assert page.locator(".viewer-tools button.active").first.inner_text() == "Edges"
    page.screenshot(path="/tmp/form-browser-workspace.png")
    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("window.scrollTo(0,0)")
    page.wait_for_timeout(500)
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
    assert page.locator(".gallery img").count() == 4
    assert not errors, errors
    browser.close()
    print(
        "PASS: upload, 4 renders, face selection, hole edit, version history, edge mode, responsive layout; no JS errors",
        flush=True,
    )
