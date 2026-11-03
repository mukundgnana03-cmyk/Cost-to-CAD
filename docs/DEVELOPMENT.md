# Developer reference

The default deployment is now one application using the root Dockerfile and render.yaml. Netlify configuration below is an optional frontend-only route, not required for the single-application setup.

# FORM — CAD engineering workspace

Working local prototype built with React, TypeScript, Three.js, FastAPI, OpenCascade (CadQuery) and headless Blender. Five sequential sections: engineering renders, description, dimensions, BOM, and a selectable 3D editing workspace.

## Publish the interface on Netlify

[Deploy to Netlify](https://app.netlify.com/start/deploy?repository=https%3A%2F%2Fgithub.com%2Fmukundgnana03-cmyk%2FCost-to-CAD) (requires your Netlify login).

The root `netlify.toml` builds the React interface. Set **CAD_BACKEND_URL** in the Netlify site's build environment to the **HTTPS origin** of your running Docker backend, for example `https://cad-api.your-domain.com` (use your actual server). Redeploy after setting it. API calls and artifacts use a same-origin Netlify proxy, so no frontend API key or permissive CORS is needed. For a login-protected backend, retain its authentication; Netlify must be able to reach it.

Without CAD_BACKEND_URL, the interface deploys with an explicit processing-server message and its Analyze button disabled. It does not simulate successful uploads. Netlify's static hosting cannot run OpenCascade or Blender; the Docker backend must be deployed on a separate server. Netlify proxy upload/response limits may be below this prototype's 200 MB local limit, so test representative file sizes and your site's plan limits before relying on large assemblies. Use the full-stack HTTPS server deployment instead for large uploads.

## Open the upload interface

**On your computer:** install Docker Desktop (or Docker Engine with Compose), then run `python scripts/start_app.py` from this checkout. It builds the services, waits for readiness and opens the browser upload screen automatically. No Gemini connection or AI API key is required to upload STEP files, render views, inspect measurements or try the supported local editing commands.

**On an existing server/domain:** use [the HTTPS deployment configuration](../deploy/README.md). A hosted URL needs a real server address, DNS and authorized deployment access; a web server running inside this workspace is not a public link.

### Optional GPT interpretation

Set `CAD_AI_API_KEY` and optionally `CAD_AI_MODEL` in the backend environment. The default model ID is `gpt-6`, as requested, but its availability has **not** been verified against an account. Use a model your OpenAI account supports. The adapter uses the Responses API, sends rendered views and metadata for descriptions, validates edit intents before CAD execution, and sets `store: false`. Measurements always come from OpenCascade. If no key is configured, the UI clearly offers local commands. Existing `OPENAI_API_KEY` bindings are also supported; do not put keys in frontend files or paste them in chat. The API credential is separate from this chat session.

## Quick start

Requirements: Python 3.12, Node 22+, Blender 3.4+ on PATH, and Linux libraries for OpenCascade (`libgl1`, `libglib2.0-0`). On Debian/Ubuntu: `sudo apt-get update && sudo apt-get install blender libgl1 libglib2.0-0`.

From the repository root:

```sh
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm --prefix frontend ci
.venv/bin/python scripts/generate_samples.py
.venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

In a second terminal:

```sh
npm --prefix frontend run dev
```

Open the Vite address printed in your terminal. Upload `samples/mounting_plate.step`, wait for automatic processing and four Blender images. The other generated samples are a 20 × 30 × 40 mm calibration block and a fixture assembly with one plate and two identical pins. File uploads support progress, multi-file native assembly packages, primary-file selection, and 200 MB combined limits. Referenced native files must be included together with unique plain filenames; nested component paths require the licensed adapter to resolve them from the component list.

### Try edits without credentials

Select a face (or switch to Edges in the viewer):

- `highlight` — selected face appearance
- `Apply a machined surface finish` — selected face appearance
- `fillet 1 mm` — selected edge, single-part geometry
- `chamfer 1 mm` — selected edge, single-part geometry
- `increase hole diameter to 12 mm` — selected simple complete through-hole cylinder

These are a strict local command parser, explicitly labeled in the interface. They are not AI. An optional OpenAI or Gemini connection enables broader phrasing for these same supported operations. Boss removal, arbitrary feature recognition, blind/intersecting-hole edits and assembly editing are rejected. Large radii can fail kernel validation. Rendering is CPU Cycles; each successful change generates four fresh images before becoming the latest version.

### Gemini (legacy optional adapter)

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` **in the backend process environment** before starting. For example, use your shell's secure environment injection or a secret manager. Compose reads a local ignored `.env`; local uvicorn does not automatically load it. Do not put credentials in browser code. Permit HTTPS to `generativelanguage.googleapis.com` in your network policy. Proxy and system TLS trust are preserved.

Gemini receives geometry facts, metadata and four rendered images for descriptions; it receives instructions, dimensions and a selection ID for edits. Structured intents are validated against an operation allowlist. It cannot execute Python, select a different face, or directly modify a file. Live API calls require your credential and outbound access; tests mock this boundary. If unconfigured, descriptions use measured geometry only; likely function and manufacturing candidates remain undetermined. If a description API call fails, geometry remains available and an explicit warning appears. Material is read when STEP XCAF metadata supplies it; unavailable material and part-number fields remain unknown; they are never inferred from pictures.

### Native CATIA (licensed integration boundary)

Native CATPart/CATProduct parsing is **not bundled or claimed to be tested**. CAD Exchanger SDK and HOOPS Exchange require commercial SDK access, a valid CATIA-capable license, vendor runtime libraries, and a vendor-specific adapter compiled/implemented against your SDK version.

Set `CATIA_CONVERTER` to an administrator-installed executable. The application invokes it **without a shell**, passing one JSON object on stdin:

```json
{"source":"/data/<project>/originals/root.CATProduct","output":"/data/<project>/converted.step","components":["/data/<project>/originals/component.CATPart"]}
```

Adapter contract: resolve supplied references, read native model using licensed CAD Exchanger/HOOPS APIs, export an assembly-preserving STEP document to the exact output path, exit 0 only on success. Keep model units and product hierarchy. SDK/license lookup must use vendor-supported server-side environment settings; never accept an executable or license path from an upload. The adapter must fail on missing references rather than exporting a partial assembly. It must validate native file contents; the application can validate extension/nonempty data but cannot verify proprietary binary signatures. We deliberately provide no invented vendor API calls. STEP conversion and the independent OpenCascade/Blender pipeline run automatically once a compatible executable is installed. Users are not asked to manually convert their native files. In Docker, add read-only mounts for the adapter, SDK runtime and license, and its required environment variables to a local Compose override.

## Geometry and persistence

- STEP is read through OpenCascade; dimensions, volume, area, cylinder diameters and circular edge radii use analytic B-rep geometry. STEP reader normalizes input lengths to mm. Bounding length/width/height correspond to world X/Y/Z, not a minimum-oriented box. Holes are inward-facing cylindrical surfaces, not a complete manufacturing feature tree. Tessellation serves visualization only.
- XCAF product definitions and occurrences produce an assembly BOM. Repeated definitions are counted together. Display names are taken from the definition; occurrence-specific names can differ. XCAF material names are read when attached to definitions. Unknown materials/part numbers stay unknown. A single part gets a single information record; a compound with no assembly structure is not invented into an assembly. STEP export of edited versions preserves geometry but does not reconstruct an assembly hierarchy (assembly precision edits are disabled).
- `data/<project>/originals/` never changes. Each successful version has STEP, STL, face meshes, selectable edges, analysis, description, appearance and four PNGs. Current version is published by atomic metadata replacement only after the full operation succeeds. Failed intermediate folders are not exposed as versions. Version history and downloads remain available after restart.
- Face/edge UUIDs map to B-rep traversal indices within an immutable version. Across versions, unique geometric signatures retain IDs; changed or ambiguous topology receives new IDs. This is a conservative prototype mapping, not a kernel-wide topological naming guarantee. Requests must name the current version; stale edits are rejected. Appearance is retained only for matching surfaces. Complex edits may invalidate selections.
- Single-process FIFO worker serializes OpenCascade calls. Keep **one uvicorn worker**. Jobs run in-process, with status on disk; after restart interrupted jobs display an error and can be retried. This prototype is not a durable distributed queue.

## Tests

```sh
.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run build
```

Tests generate STEP models, compare analytic measurements, count assembly occurrences, validate fillets/chamfers/hole resizing, verify stable selections, upload files through FastAPI, run real Blender rendering, inspect PNGs, modify geometry and finish, check stale edits, confirm version/original preservation, reject unsupported operations, and mock the Gemini protocol. The render integration test requires Blender. It does not substitute fake render files. A restrictive sandbox that denies local sockets can hang FastAPI TestClient; use an execution context supporting local sockets.

## Docker

```sh
docker compose up --build
```

Browse port 8080 on your local machine. A single FastAPI process serves the built frontend, API, downloads and Blender jobs on one loopback-bound port. Named `cad-data` volume retains versions. The application runs as a non-root user. Delete the volume only when you intend to remove models.

For managed development environments whose package proxy uses a custom CA, supply a combined trusted bundle as BuildKit secret `proxy_ca` to the unified build; TLS verification stays enabled. Do not copy session CA files into images. For example:

```sh
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -f Dockerfile -t form-cad .
```

## Cloud deployment

For a private prototype, use a Linux VM with Docker Compose, at least 4 CPU cores, 8 GB RAM and persistent SSD space. Start Compose behind an authenticated HTTPS ingress (Caddy, Nginx, or your cloud load balancer), with no public backend port. Add authentication **before exposing the app**: this local prototype has no users or access control and uploaded models are accessible to anyone who can reach its API. Store Gemini/SDK credentials in the server's secret manager; allow only required outbound destinations. Back up the volume and verify recovery.

Before multi-tenant production: add per-user/project authorization on every artifact route, isolated unprivileged CAD/render worker containers with CPU/memory/time quotas, a durable job queue, database transactions, object storage with versioned private objects, signed authorized downloads, malware/content scanning and audit logs. The local file layout and immutable version IDs define a storage boundary that can be replaced with object storage. Browser-provided MIME types and extensions are not security boundaries. A valid STEP file can still be computationally expensive: the current upload limit and Blender timeout are not sufficient isolation for hostile public input. No production deployment or proprietary license is fabricated by this project.

### Optional browser smoke test

With the two development servers running, install Playwright in a separate tooling environment (`pip install playwright && playwright install chromium`), then run:

```sh
python scripts/browser_smoke.py
# Or use an installed Chromium:
python scripts/browser_smoke.py --chromium /usr/bin/chromium
```

It uploads the generated mounting plate, checks four real renders and measured volume, selects a hole, submits a resize, waits for revised measurements and version history, checks a direct viewer face click and edge mode, and verifies mobile overflow and JavaScript errors. The temporary screenshot is saved outside the checkout under `/tmp/`.
