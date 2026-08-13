#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"
PGDATA="$ROOT/data/postgres"

set -a
. "$ROOT/.env"
set +a

"$RUNTIME/pg_ctl" -D "$PGDATA" restart -m fast -l "$ROOT/logs/postgres.log"
for _ in $(seq 1 30); do
  if "$RUNTIME/pg_isready" -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
"$RUNTIME/psql" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select count(*) from posts where deleted_at is null"
