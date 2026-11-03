# FORM — upload a CAD model, get results

One application handles the web interface, precise CAD measurements and Blender rendering. Users only **upload a model and wait for the results**. No API key or separate processing-server address is needed.

## Put the whole app online

[**Deploy the complete application**](https://render.com/deploy?repo=https://github.com/mukundgnana03-cmyk/Cost-to-CAD)

This opens Render's deployment setup for this repository. Sign in and confirm the hosting plan shown there; the blueprint includes compute and persistent model storage, which the provider charges for. Once deployment finishes, Render supplies the web address to share with users. No live deployment is claimed until it has actually completed.

The app includes Blender and OpenCascade. A single service hosts everything, including saved models and images. There is no `CAD_BACKEND_URL` to configure. Netlify's static hosting cannot execute native Blender; this deployment runs the entire app together on a host that can.

## Using the app

1. Open the deployed web address.
2. Click **Upload 3D model** and choose a STEP/STP file.
3. Processing starts automatically. View the four photographs, description, exact dimensions, part/assembly record and interactive 3D model.

Originals are preserved. Supported edits create new versions. Multiple assembly reference files can be uploaded together; if choosing between multiple primary models is necessary, select the primary file and press Analyze.

Native CATPart/CATProduct still require a licensed reader installed by the app operator. STEP works independently. GPT interpretation is optional; rendering and measurements work without it.

## Run locally

With Docker Desktop installed, run `python scripts/start_app.py`. It starts the single application and opens the upload page. Alternatively run `docker compose up --build` from the repository root. This is an operator/developer option; people using the hosted website do not install anything.

[Development details](docs/DEVELOPMENT.md) · [Validation results](docs/VALIDATION.md)
