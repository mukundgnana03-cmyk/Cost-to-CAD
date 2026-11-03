# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS frontend
WORKDIR /web
COPY frontend/package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true; else npm ci; fi
COPY frontend ./
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends blender libgl1 libglib2.0-0 ca-certificates gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then PIP_CERT=/run/secrets/proxy_ca pip install --no-cache-dir -r requirements.txt; else pip install --no-cache-dir -r requirements.txt; fi
COPY --chown=10001:10001 backend /app/backend
COPY --chown=10001:10001 scripts /app/scripts
COPY --from=frontend --chown=10001:10001 /web/dist /app/web
RUN useradd --create-home --uid 10001 cad && mkdir /data && chown cad:cad /data
ENV CAD_DATA_DIR=/data CAD_WEB_DIR=/app/web XDG_CACHE_HOME=/tmp/cad-cache PYTHONUNBUFFERED=1 PORT=8000
COPY --chmod=755 scripts/container-entrypoint.sh /usr/local/bin/form-entrypoint
ENTRYPOINT ["/usr/local/bin/form-entrypoint"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/api/health')"
CMD ["python", "-m", "backend.app.serve"]
