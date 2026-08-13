#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
ENV_FILE="$ROOT/.env"
UPLOADS_VALUE="$ROOT/uploads"

# Repair malformed suffixes produced by previous Windows SSH quoting passes.
sed -i 's|nnUPLOADS_DIR=/home/yty/blog/uploadsn$||' "$ENV_FILE"
sed -i 's|UPLOADS_DIR=/home/yty/blog/uploads$||' "$ENV_FILE"

if grep -q '^UPLOADS_DIR=' "$ENV_FILE"; then
  sed -i "s|^UPLOADS_DIR=.*|UPLOADS_DIR=$UPLOADS_VALUE|" "$ENV_FILE"
else
  if [ -n "$(tail -c 1 "$ENV_FILE")" ]; then
    printf '\n' >> "$ENV_FILE"
  fi
  printf '%s\n' "UPLOADS_DIR=$UPLOADS_VALUE" >> "$ENV_FILE"
fi

mkdir -p "$UPLOADS_VALUE/avatars" "$UPLOADS_VALUE/covers"
chmod 750 "$UPLOADS_VALUE" "$UPLOADS_VALUE/avatars" "$UPLOADS_VALUE/covers"
