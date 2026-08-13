#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"

for name in scheduler app; do
  pidfile="$ROOT/run/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    kill "$(cat "$pidfile")"
  fi
done

"$RUNTIME/redis-cli" -h 127.0.0.1 -p 6379 shutdown >/dev/null 2>&1 || true
"$RUNTIME/pg_ctl" -D "$ROOT/data/postgres" stop -m fast >/dev/null 2>&1 || true
