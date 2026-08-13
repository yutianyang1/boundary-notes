#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"

set -a
. "$ROOT/.env"
set +a

"$RUNTIME/psql" -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off <<'SQL'
SELECT
  pid,
  usename,
  state,
  wait_event_type,
  wait_event,
  age(clock_timestamp(), query_start) AS query_age,
  left(query, 160) AS query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start;

SELECT
  blocked.pid AS blocked_pid,
  blocking.pid AS blocking_pid,
  blocked.mode AS blocked_mode,
  blocked.relation::regclass AS relation
FROM pg_locks blocked
JOIN pg_locks blocking
  ON blocking.locktype = blocked.locktype
 AND blocking.database IS NOT DISTINCT FROM blocked.database
 AND blocking.relation IS NOT DISTINCT FROM blocked.relation
 AND blocking.page IS NOT DISTINCT FROM blocked.page
 AND blocking.tuple IS NOT DISTINCT FROM blocked.tuple
 AND blocking.virtualxid IS NOT DISTINCT FROM blocked.virtualxid
 AND blocking.transactionid IS NOT DISTINCT FROM blocked.transactionid
 AND blocking.classid IS NOT DISTINCT FROM blocked.classid
 AND blocking.objid IS NOT DISTINCT FROM blocked.objid
 AND blocking.objsubid IS NOT DISTINCT FROM blocked.objsubid
 AND blocking.pid <> blocked.pid
WHERE NOT blocked.granted
  AND blocking.granted;
SQL
