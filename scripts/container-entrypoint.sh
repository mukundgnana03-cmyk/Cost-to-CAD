#!/bin/sh
set -eu
# Persistent disks may be mounted root-owned by the host. Initialize their root,
# then run every application operation as the unprivileged CAD user.
storage_dir="${CAD_DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
    mkdir -p "$storage_dir"
    chown 10001:10001 "$storage_dir"
    exec gosu 10001:10001 "$@"
fi
exec "$@"
