#!/bin/bash
# Take ownership of the mounted volumes, then hand off to supervisor.
#
# Why this exists: the app runs as an unprivileged user (uid 1000), but Docker creates
# bind-mount targets owned by ROOT. Without this, a plain `docker compose up -d` on a fresh
# checkout hands the container a /data it cannot write to, and the backend dies on boot with
# `PermissionError: /data/thumbs`.
#
# supervisor itself stays root — it only supervises — and drops each program to uid 1000 via
# the `user=` directive in supervisord.conf. So nothing that touches the network ever runs as
# root. (Dropping privileges here instead, with gosu, breaks supervisor's logging: the
# container's stdout pipe is owned by root and an unprivileged process cannot open
# /dev/stdout.)
#
# Set PUID/PGID to match a host account if you want the files on /dicomfiles owned by you
# rather than by 1000 — useful on a NAS.

set -euo pipefail

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
APP_USER=dicomium

# Someone may have overridden the user (`user:` in compose). Then we cannot chown anything,
# and it is their job to have made the volumes writable — so just run.
if [ "$(id -u)" -ne 0 ]; then
  exec "$@"
fi

# Re-point the app user at the requested ids, if they differ from the baked-in ones.
if [ "$(id -u "$APP_USER")" != "$PUID" ] || [ "$(id -g "$APP_USER")" != "$PGID" ]; then
  groupmod -o -g "$PGID" "$APP_USER"
  usermod -o -u "$PUID" -g "$PGID" "$APP_USER"
fi

for dir in /data /dicomfiles; do
  mkdir -p "$dir"

  # Only chown when the ownership is actually wrong. /dicomfiles can hold a hundred thousand
  # files, and a blind recursive chown would add minutes to every single start.
  if [ "$(stat -c %u "$dir")" != "$PUID" ] || [ "$(stat -c %g "$dir")" != "$PGID" ]; then
    echo "[entrypoint] taking ownership of $dir for ${PUID}:${PGID}"
    chown -R "$PUID:$PGID" "$dir"
  fi
done

# nginx's scratch dirs live in the image, not on a volume, so a PUID change needs them too.
chown -R "$PUID:$PGID" /tmp/nginx-body /tmp/nginx-proxy /var/lib/nginx /var/log/nginx 2>/dev/null || true

exec "$@"
