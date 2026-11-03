# FORM — public CAD playground

A shareable website where anyone can try a sample part or open a STEP model, inspect exact measurements, rotate the 3D model and try a precision edit. No visitor account, API key or separate server is required for the playground.

## Publish on Netlify

[**Deploy the playground to Netlify**](https://app.netlify.com/start/deploy?repository=https%3A%2F%2Fgithub.com%2Fmukundgnana03-cmyk%2FCost-to-CAD)

Sign in to Netlify and deploy this repository. `netlify.toml` supplies the build settings automatically. Once Netlify finishes, its generated `https://…netlify.app` address is the common website link you can share. Use **Share website** inside the app to copy it.

Creating a site requires the owner's Netlify account access. A deployment-setup button is not an already-live website. No live Netlify URL is claimed until a deployment succeeds.

## What visitors can do

- Click **Try sample part**, or upload STEP/STP up to 20 MB. Processing starts automatically.
- See four downloadable WebGL previews, exact OpenCascade B-rep dimensions, volume, surface area, hole surfaces and circular edge radii.
- Click faces/edges and inspect their measurements.
- Apply highlight or a machined appearance, or use `fillet 1 mm` / `chamfer 1 mm` on a selected edge. Precision edits are limited to single-solid parts and must pass the CAD kernel's validity checks.
- Switch between versions and download original or revised STEP files.

The CAD kernel runs as WebAssembly in a worker on each visitor's device. Files are not uploaded to a processing server. Each visitor has a separate session; refreshing clears it, so download results you want to keep. The first operation downloads the roughly 19 MB CAD engine (about 6 MB compressed). Browser processing has a 90-second job limit and supports 20 versions per tab.

## Honest feature boundaries

The Netlify playground uses **WebGL previews, not Blender photographs**. It provides geometry facts and local editing commands, not AI chat. It does not extract assembly BOM hierarchy, materials or part numbers, and it does not parse proprietary CATIA files. Multiple-solid files show a solid inventory rather than an invented BOM. Hole resizing and boss removal are not supported in this browser mode.

The full application is also included: it uses Blender for product renders, Python OpenCascade for processing, optional GPT/Gemini interpretation, persistent model storage and a licensed CATIA adapter boundary. [Deploy the complete Blender application](https://render.com/deploy?repo=https://github.com/mukundgnana03-cmyk/Cost-to-CAD) on a compute host, or use `python scripts/start_app.py` locally. Those integrations are not necessary to use the Netlify playground.

## Development and checks

```sh
npm --prefix frontend ci
# Browser playground development:
VITE_PLAYGROUND=true npm --prefix frontend run dev
# The exact Netlify production build (run from frontend/):
VITE_PLAYGROUND=true npm run build
VITE_PLAYGROUND=true node ../deploy/netlify-redirects.mjs
npm run preview -- --port 5175
# In another terminal, with Playwright + Chromium installed:
python scripts/playground_smoke.py --url http://127.0.0.1:5175
```

The browser test verifies real STEP import, analytic reference measurements, four previews, a kernel fillet, original preservation, version history, surface appearance, STEP download, mobile layout and independent visitor sessions. It also asserts zero backend API calls and zero JavaScript page errors.

[Full application developer reference](docs/DEVELOPMENT.md) · [Validation results](docs/VALIDATION.md) · [Open-source notices](frontend/public/third-party-notices.txt)
