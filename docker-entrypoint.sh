#!/bin/sh
# Host folders mounted at /data are often created by root; hand them to the app user, then drop root.
set -e
if [ "$(id -u)" = 0 ]; then
  if [ "$(stat -c %u "$COINIO_DATA_DIR")" != "$(id -u node)" ]; then
    chown -R node:node "$COINIO_DATA_DIR"
  fi
  exec su-exec node "$@"
fi
exec "$@"
