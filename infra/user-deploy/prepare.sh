#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"
PGDATA="$ROOT/data/postgres"

set -a
. "$ROOT/.env"
set +a

mkdir -p "$PGDATA" "$ROOT/data/redis" "$ROOT/logs" "$ROOT/run" "$ROOT/deploy"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  "$RUNTIME/initdb" -D "$PGDATA" --username="$POSTGRES_USER" --auth=trust --encoding=UTF8
  printf "listen_addresses = '127.0.0.1'\nport = 5432\n" >> "$PGDATA/postgresql.conf"
fi

if ! "$RUNTIME/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  "$RUNTIME/pg_ctl" -D "$PGDATA" -l "$ROOT/logs/postgres.log" start
fi

for _ in $(seq 1 30); do
  "$RUNTIME/pg_isready" -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" >/dev/null 2>&1 && break
  sleep 1
done

if ! "$RUNTIME/psql" -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" | grep -q 1; then
  "$RUNTIME/createdb" -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" "$POSTGRES_DB"
fi

if [ ! -f "$ROOT/data/.schema-v1" ]; then
  "$RUNTIME/psql" -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$ROOT/deploy/001-extensions.sql"
  "$RUNTIME/psql" -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$ROOT/deploy/0000-schema.sql"
  touch "$ROOT/data/.schema-v1"
fi

if ! "$RUNTIME/redis-cli" -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
  "$RUNTIME/redis-server" --bind 127.0.0.1 --port 6379 --daemonize yes \
    --pidfile "$ROOT/run/redis.pid" --dir "$ROOT/data/redis" --appendonly yes \
    --appendfilename appendonly.aof --logfile "$ROOT/logs/redis.log"
fi

echo "Runtime services are ready"
