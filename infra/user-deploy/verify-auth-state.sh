#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"
COOKIE="$ROOT/run/auth-check.cookies"

set -a
. "$ROOT/.env"
set +a

if [ -f "$COOKIE" ]; then
  echo "cookie_names:"
  awk -F '\t' '($0 ~ /^#HttpOnly_/ || $0 !~ /^#/) && NF >= 7 { print $6 }' "$COOKIE"
fi

"$RUNTIME/psql" -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At <<'SQL'
SELECT 'password_algorithm',
  CASE
    WHEN password_hash LIKE '$argon2id$%' THEN 'argon2id'
    WHEN password_hash LIKE '$2%' THEN 'bcrypt'
    ELSE 'other'
  END
FROM users
WHERE email = 'admin@local.test';

SELECT 'sessions_total', count(*) FROM user_sessions
UNION ALL
SELECT 'sessions_active', count(*) FROM user_sessions
WHERE revoked_at IS NULL AND expires_at > now()
UNION ALL
SELECT 'sessions_seen', count(*) FROM user_sessions
WHERE last_seen_at > created_at
ORDER BY 1;
SQL
