# syntax=docker/dockerfile:1

# ---- 1. build the SPA --------------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /build

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ---- 2. resolve python deps --------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS backend
WORKDIR /app/backend

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --no-dev --no-install-project


# ---- 3. runtime --------------------------------------------------------------
# Debian, not Alpine: pylibjpeg's decoders ship manylinux (glibc) wheels only, so musl
# would force a from-source C++ build of the JPEG/JPEG2000 codecs.
FROM python:3.13-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx supervisor curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 1000 --create-home --shell /bin/bash dicomium

COPY --from=backend /app/.venv /app/.venv
COPY --from=frontend /build/dist /app/frontend/dist
COPY backend/ /app/backend/
COPY nginx.conf /etc/nginx/sites-available/default
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# nginx must run unprivileged: give it a writable pid/temp home and drop the stock
# master-process user directive.
RUN sed -i 's|^pid .*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && sed -i '/^user /d' /etc/nginx/nginx.conf \
    && mkdir -p /tmp/nginx-body /tmp/nginx-proxy /data /dicomfiles /var/lib/nginx \
    && chown -R dicomium:dicomium /tmp/nginx-body /tmp/nginx-proxy /data /dicomfiles \
                                   /var/lib/nginx /var/log/nginx /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app/backend \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    DICOM_ROOT=/dicomfiles \
    # Starlette spools large multipart parts to TMPDIR. Point it at the big volume, or a
    # multi-GB upload fills the container's writable layer and dies with ENOSPC.
    TMPDIR=/dicomfiles/.tmp

# Deliberately NOT `USER dicomium`. Docker creates bind-mount targets owned by ROOT, so a
# container that started unprivileged could not write to a freshly-mounted /data and would die
# on boot with PermissionError. Instead the entrypoint starts as root purely to chown the
# volumes, and supervisor then drops BOTH programs to uid 1000 (see supervisord.conf) — so
# nothing that serves a request ever runs as root.
WORKDIR /app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
