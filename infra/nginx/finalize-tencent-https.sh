#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
ENV_FILE="$ROOT/.env"
NODE_BIN=/home/yty/.nvm/versions/node/v24.15.0/bin
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="$ROOT/backups/env-before-https-$STAMP"

umask 077
cp -p "$ENV_FILE" "$BACKUP"
chmod 600 "$ENV_FILE" "$BACKUP"

upsert_env() {
  key=$1
  value=$2
  temp=$(mktemp "$ROOT/.env.XXXXXX")
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 {
      if (!found) print key "=" value
      found = 1
      next
    }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_FILE" > "$temp"
  chmod 600 "$temp"
  mv "$temp" "$ENV_FILE"
}

start_app() {
  pidfile="$ROOT/run/app.pid"
  if test -f "$pidfile" && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    kill "$(cat "$pidfile")"
    for _ in $(seq 1 20); do
      kill -0 "$(cat "$pidfile")" 2>/dev/null || break
      sleep 1
    done
  fi

  set -a
  . "$ENV_FILE"
  set +a
  export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
  export PORT=3000 HOSTNAME=127.0.0.1
  export UPLOADS_DIR="${UPLOADS_DIR:-$ROOT/uploads}"

  cd "$ROOT/app"
  nohup "$NODE_BIN/node" server.js >> "$ROOT/logs/app.log" 2>&1 &
  echo $! > "$pidfile"

  for _ in $(seq 1 60); do
    curl --fail --silent --max-time 3 http://127.0.0.1:3000/ >/dev/null && return 0
    sleep 1
  done
  return 1
}

upsert_env AUTH_URL https://xiudou.site
upsert_env NEXT_PUBLIC_SITE_URL https://xiudou.site
upsert_env AUTH_TRUST_HOST true

if ! start_app; then
  cp -p "$BACKUP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  start_app || true
  echo "HTTPS URL activation failed; previous environment restored." >&2
  exit 1
fi

echo "HTTPS URL activation succeeded."
echo "env_backup=$BACKUP"
