# Prototype verification — 2026-11-03

Observed on Linux with Python 3.12.14, CadQuery 2.6.1 / OpenCascade 7.8.1, Blender 4.3.2, Node 24.19 and installed Chromium.

- `python -m pytest backend/tests -q --disable-warnings`: **6 passed** in 127.88 seconds; 19 upstream deprecation warnings. Includes real Blender renders and geometry/appearance edits, not substituted image fixtures.
- `npm run build` in frontend: **passed** (TypeScript + Vite). Vite reports a large bundle warning from Three.js and viewer libraries; this is a performance optimization opportunity, not a failed build.
- Ruff undefined/unused-name checks and Prettier frontend checks: **passed**.
- `python scripts/browser_smoke.py --chromium /usr/bin/chromium`: **passed**. Fresh STEP upload, four images, analytical volume, cylindrical-face selection, selected-hole enlargement, refreshed measurements, two immutable versions, direct viewer face selection, edge mode and 390-pixel mobile layout; no JavaScript page errors.
- Backend and frontend Docker images: **built successfully** using verified TLS and a BuildKit-mounted combined CA bundle for the managed package proxy.
- Backend non-root Docker runtime: real upload/render/resize/finish integration test **passed** in 68.22 seconds; specified-material STEP round-trip test **passed** in 3.71 seconds.
- Production Nginx container and private backend on an isolated Docker network: `/` and `/api/health` both **HTTP 200**. Health confirmed Blender availability. Temporary smoke containers/network removed afterward.
- `docker compose config --quiet`: **passed**.

Analytic reference: 80 × 50 × 12 mm plate, four Ø8 mm through-holes: volume 45,587.256842 mm³. Resizing one to Ø12 mm produces volume 44,833.274605 mm³. Calibration block: 20 × 30 × 40 mm, 24,000 mm³ volume and 5,200 mm² surface area. Assembly: one plate and two occurrences of the same pin definition. Specified XCAF material survived an actual STEP export/import round trip.

## Boundaries

Live Gemini access was **not tested**: no Gemini credential was configured. Structured-intent validation is tested with a mock, and the independent local command path is tested end-to-end. No AI analysis success is fabricated.

Proprietary CATIA parsing was **not tested or bundled**: no licensed CAD Exchanger / HOOPS SDK or vendor adapter was supplied. Missing integration produces an explicit error. The executable conversion contract and required configuration are documented in README.md.

No public deployment or environment publication was performed. Production authentication, durable distributed workers and tenant isolation remain deployment work; see README.md.

## Follow-up: OpenAI and upload access

Added a Responses API adapter with configurable GPT model, independent local editing mode, a browser-opening Docker launcher, and an HTTPS server deployment override. OpenAI request structure, four rendered-image attachments, intent validation and material-fact preservation are tested using mocked HTTP. No live OpenAI credential or GPT-6 availability is claimed. Server deployment is pending the user's target/access details.

## Single-application packaging

The default deployment now bundles the React build, FastAPI, OpenCascade and Blender into one application, served at one origin. A single STEP selection automatically uploads and processes the part; no Analyze click or separate backend address is needed.

- Unified image build: successful.
- Browser smoke against the unified container at a single port: passed automatic upload, four real Blender renders, selected-hole enlargement, updated volume, immutable versions, viewer picking, edge mode, mobile layout and JavaScript-error checks.
- Remaining geometry, AI-boundary, metadata and static-serving checks: 8 passed (the real rendering path was exercised by the browser run).
- Single-service Compose and the optional HTTPS ingress override: configuration validation passed.
- Render blueprint added for one hosted application with persistent model storage. No live Render deployment is claimed; account login and confirmation of the provider's compute/storage plan are still needed.
- Final persistent-disk startup check: a deliberately root-owned mounted volume was initialized successfully; the web interface and health API returned HTTP 200 on the same port, Blender was available, model storage was writable, and the main application process ran as UID 10001.
