#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
set -a
. "$ROOT/.env"
set +a

echo "APP_TARGET"
readlink -f "$ROOT/app"
echo "SITE_URL"
echo "$NEXT_PUBLIC_SITE_URL"
echo "COVER_FILES"
find "$ROOT/uploads/covers" -maxdepth 1 -type f -printf '%f|%s\n' | sort
echo "HEIC_RUNTIME"
find "$ROOT/app" \( -path '*heic-decode/index.js' -o -path '*libheif-js/wasm-bundle.js' \) -print | head
echo "PROCESS_STATUS"
for name in app scheduler; do
  pidfile="$ROOT/run/$name.pid"
  pid=$(cat "$pidfile")
  if kill -0 "$pid" 2>/dev/null; then
    echo "$name|running|$pid"
  else
    echo "$name|stopped|$pid"
    exit 1
  fi
done
echo "RECENT_ERRORS"
tail -120 "$ROOT/logs/app.log" | grep -Ei 'error|exception|failed' | tail -20 || true
echo "INTERNAL_URLS"
for path in / /posts/attention-residuals /media/covers/19cebdfc-afdd-41af-b8ea-54d8c7dd856e.png; do
  curl -fsS -o /dev/null -w "$path|%{http_code}\n" "http://127.0.0.1:3000$path"
done
echo "PUBLIC_URL"
curl -LfsS -o /dev/null -w '%{url_effective}|%{http_code}\n' --max-time 20 "$NEXT_PUBLIC_SITE_URL"
