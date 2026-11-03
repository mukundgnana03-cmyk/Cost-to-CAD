# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends blender libgl1 libglib2.0-0 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then PIP_CERT=/run/secrets/proxy_ca pip install --no-cache-dir -r requirements.txt; else pip install --no-cache-dir -r requirements.txt; fi
COPY --chown=10001:10001 backend /app/backend
COPY --chown=10001:10001 scripts /app/scripts
RUN useradd --create-home --uid 10001 cad && mkdir /data && chown cad:cad /data
ENV CAD_DATA_DIR=/data XDG_CACHE_HOME=/tmp/cad-cache PYTHONUNBUFFERED=1
USER cad
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn","backend.app.main:app","--host","0.0.0.0","--port","8000"]
