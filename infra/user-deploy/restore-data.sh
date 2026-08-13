#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"
DUMP=${1:-$ROOT/backups/blog-dev-data.dump}
STAMP=$(date +%Y%m%d-%H%M%S)

set -a
. "$ROOT/.env"
set +a

mkdir -p "$ROOT/backups"
"$RUNTIME/pg_dump" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -Fc --no-owner --no-acl -f "$ROOT/backups/pre-import-$STAMP.dump"

for name in scheduler app; do
  pidfile="$ROOT/run/$name.pid"
  if [ -f "$pidfile" ]; then
    xargs -r kill < "$pidfile" || true
  fi
done
sleep 2

"$RUNTIME/psql" -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
TRUNCATE TABLE
  audit_logs,
  categories,
  comments,
  job_runs,
  post_redirects,
  post_revisions,
  post_tags,
  posts,
  settings,
  tags,
  users,
  drizzle.__drizzle_migrations
RESTART IDENTITY CASCADE;
SQL

"$RUNTIME/pg_restore" --exit-on-error --single-transaction --disable-triggers \
  --data-only --no-owner --no-acl \
  -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$DUMP"

"$ROOT/deploy/start.sh"

"$RUNTIME/psql" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At <<'SQL'
SELECT 'users', count(*) FROM users
UNION ALL SELECT 'posts', count(*) FROM posts
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
ORDER BY 1;
SQL
