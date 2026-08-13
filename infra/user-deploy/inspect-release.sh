#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
PSQL="$ROOT/runtime/bin/psql"

set -a
. "$ROOT/.env"
set +a

echo "APP_TARGET"
readlink -f "$ROOT/app" || true
echo "SOURCE_TIME"
stat -c '%y' "$ROOT/source/package.json"
echo "STATUS_COUNTS"
"$PSQL" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' \
  -c "select status,count(*) from posts where deleted_at is null group by status order by status"
echo "POSTS_TOTAL"
"$PSQL" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select count(*) from posts where deleted_at is null"
echo "USERS"
"$PSQL" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select count(*) from users where deleted_at is null"
echo "MEDIA"
"$PSQL" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select count(*) from media where deleted_at is null"
echo "MIGRATIONS"
"$PSQL" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "select count(*) from drizzle.__drizzle_migrations"
echo "USERS_IDS"
"$PSQL" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c \
  "select id,role from users where deleted_at is null order by id"
echo "POST_DETAILS"
"$PSQL" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c \
  "select slug,status,author_id,coalesce(cover,'') from posts where deleted_at is null order by slug"
echo "ENGAGEMENT"
for table in post_view_counts comments; do
  printf '%s|' "$table"
  "$PSQL" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
    "select count(*) from $table"
done
echo "HEIF_TOOLS"
command -v heif-info || true
command -v heif-dec || true
echo "IDENTITY"
id
if sudo -n true >/dev/null 2>&1; then
  echo "sudo-ok"
else
  echo "sudo-unavailable"
fi
echo "OS"
sed -n '1,8p' /etc/os-release
echo "HEALTH"
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
