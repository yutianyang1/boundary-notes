#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"
PGDATA="$ROOT/data/postgres"
REDIS_DATA="$ROOT/data/redis"
LOG_DIR="$ROOT/logs"
RUN_DIR="$ROOT/run"
NODE_BIN=/home/yty/.nvm/versions/node/v24.15.0/bin
export PATH="$NODE_BIN:$PATH"

set -a
. "$ROOT/.env"
set +a
export UPLOADS_DIR="${UPLOADS_DIR:-$ROOT/uploads}"

mkdir -p "$PGDATA" "$REDIS_DATA" "$LOG_DIR" "$RUN_DIR" "$UPLOADS_DIR/avatars" "$UPLOADS_DIR/covers"
mkdir -p "$ROOT/backups" "$UPLOADS_DIR/library"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  "$RUNTIME/initdb" -D "$PGDATA" --username="$POSTGRES_USER" --auth=trust --encoding=UTF8
  printf "listen_addresses = '127.0.0.1'\nport = 5432\n" >> "$PGDATA/postgresql.conf"
fi

if ! "$RUNTIME/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  "$RUNTIME/pg_ctl" -D "$PGDATA" -l "$LOG_DIR/postgres.log" start
fi

for _ in $(seq 1 30); do
  "$RUNTIME/pg_isready" -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" >/dev/null 2>&1 && break
  sleep 1
done
"$RUNTIME/pg_isready" -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER"

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
    --pidfile "$RUN_DIR/redis.pid" --dir "$REDIS_DATA" --appendonly yes \
    --appendfilename appendonly.aof --logfile "$LOG_DIR/redis.log"
fi

backup="$ROOT/backups/pre-migrate-$(date -u +%Y%m%dT%H%M%SZ).dump"
"$RUNTIME/pg_dump" -Fc -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$backup"
find "$ROOT/backups" -maxdepth 1 -type f -name 'pre-migrate-*.dump' -mtime +14 -delete

cd "$ROOT/source"
"$NODE_BIN/node" "$ROOT/deploy/baseline-drizzle.cjs"
"$NODE_BIN/npm" run db:migrate

cd "$ROOT/app"
"$NODE_BIN/node" "$ROOT/deploy/seed-admin.cjs"

if [ -f "$RUN_DIR/app.pid" ] && kill -0 "$(cat "$RUN_DIR/app.pid")" 2>/dev/null; then
  kill "$(cat "$RUN_DIR/app.pid")"
  for _ in $(seq 1 20); do
    kill -0 "$(cat "$RUN_DIR/app.pid")" 2>/dev/null || break
    sleep 1
  done
fi

export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=127.0.0.1
nohup "$NODE_BIN/node" server.js >> "$LOG_DIR/app.log" 2>&1 &
echo $! > "$RUN_DIR/app.pid"

if [ -f "$RUN_DIR/scheduler.pid" ] && kill -0 "$(cat "$RUN_DIR/scheduler.pid")" 2>/dev/null; then
  kill "$(cat "$RUN_DIR/scheduler.pid")" || true
fi
nohup "$ROOT/deploy/scheduler.sh" >> "$LOG_DIR/scheduler.log" 2>&1 &
echo $! > "$RUN_DIR/scheduler.pid"

for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:3000/ >/dev/null; then
    echo "Blog is healthy at http://127.0.0.1:3000/"
    exit 0
  fi
  sleep 1
done

echo "Blog failed its startup health check" >&2
tail -80 "$LOG_DIR/app.log" >&2 || true
exit 1
