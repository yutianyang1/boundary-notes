#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"

set -a
. "$ROOT/.env"
set +a

mkdir -p "$ROOT/backups"
if [ "${1:-}" = "--backup" ]; then
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="$ROOT/backups/pre-release-$stamp.dump"
  "$RUNTIME/pg_dump" -Fc --no-owner --no-acl \
    -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$target"
  echo "backup=$target"
fi

"$RUNTIME/psql" -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At <<'SQL'
SELECT 'posts', count(*) FROM posts
UNION ALL SELECT 'published', count(*) FROM posts WHERE status = 'published' AND deleted_at IS NULL
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'categories', count(*) FROM categories
UNION ALL SELECT 'sessions', count(*) FROM user_sessions
UNION ALL SELECT 'mail_outbox', count(*) FROM mail_outbox
ORDER BY 1;
SQL
