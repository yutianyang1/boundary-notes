#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"
NODE_BIN=/home/yty/.nvm/versions/node/v24.15.0/bin
RELEASE_NAME=${1:?release name is required}
STAGE=${2:-/tmp/blog-deploy-$RELEASE_NAME}
RELEASE="$ROOT/releases/$RELEASE_NAME"

for artifact in app.tgz source.tgz content.dump uploads.tgz; do
  test -s "$STAGE/$artifact" || {
    echo "missing artifact: $STAGE/$artifact" >&2
    exit 1
  }
done

set -a
. "$ROOT/.env"
set +a
export PATH="$NODE_BIN:$PATH"

mkdir -p "$ROOT/backups" "$ROOT/releases" "$ROOT/uploads"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
full_backup="$ROOT/backups/pre-release-$RELEASE_NAME-$stamp.dump"
engagement_backup="$ROOT/backups/pre-content-$RELEASE_NAME-$stamp.dump"
source_backup="$ROOT/backups/source-$RELEASE_NAME-$stamp.tgz"

echo "Creating full database backup: $full_backup"
"$RUNTIME/pg_dump" -Fc --no-owner --no-acl \
  -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$full_backup"
tar -czf "$source_backup" -C "$ROOT/source" \
  --exclude=node_modules --exclude=.next .

test ! -e "$RELEASE" || {
  echo "release already exists: $RELEASE" >&2
  exit 1
}
mkdir -p "$RELEASE"
tar -xzf "$STAGE/app.tgz" -C "$RELEASE"
tar -xzf "$STAGE/source.tgz" -C "$ROOT/source"
tar -xzf "$STAGE/uploads.tgz" -C "$ROOT/uploads"
mkdir -p "$ROOT/uploads/avatars" "$ROOT/uploads/covers" "$ROOT/uploads/library"

# The standalone artifact may be assembled in Alpine and therefore contain
# only the musl Argon2 binding. Production runs on Ubuntu/glibc, so reuse the
# version-matched GNU binding installed in the persistent source tree.
ARGON2_PACKAGE="$RELEASE/node_modules/@node-rs/argon2/package.json"
ARGON2_GNU_SOURCE="$ROOT/source/node_modules/@node-rs/argon2-linux-x64-gnu"
ARGON2_GNU_TARGET="$RELEASE/node_modules/@node-rs/argon2-linux-x64-gnu"
if [ -f "$ARGON2_PACKAGE" ] && [ ! -f "$ARGON2_GNU_TARGET/argon2.linux-x64-gnu.node" ]; then
  test -f "$ARGON2_GNU_SOURCE/argon2.linux-x64-gnu.node" || {
    echo "GNU Argon2 binding is missing from persistent source dependencies" >&2
    exit 1
  }
  app_argon2_version=$("$NODE_BIN/node" -p "require('$ARGON2_PACKAGE').version")
  gnu_argon2_version=$("$NODE_BIN/node" -p "require('$ARGON2_GNU_SOURCE/package.json').version")
  test "$app_argon2_version" = "$gnu_argon2_version" || {
    echo "Argon2 binding version mismatch: app=$app_argon2_version gnu=$gnu_argon2_version" >&2
    exit 1
  }
  cp -a "$ARGON2_GNU_SOURCE" "$ARGON2_GNU_TARGET"
fi

cp "$ROOT/source/infra/user-deploy/"*.sh "$ROOT/deploy/"
cp "$ROOT/source/infra/user-deploy/"*.cjs "$ROOT/deploy/"
chmod 700 "$ROOT/deploy/"*.sh

echo "Applying schema migrations"
cd "$ROOT/source"
"$NODE_BIN/node" "$ROOT/deploy/baseline-drizzle.cjs"
"$NODE_BIN/npm" run db:migrate

echo "Preserving production views and comments: $engagement_backup"
"$RUNTIME/pg_dump" -Fc --data-only --no-owner --no-acl \
  -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -t post_view_counts -t post_view_daily -t comments -t post_broadcasts \
  -f "$engagement_backup"

for name in scheduler app; do
  pidfile="$ROOT/run/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    kill "$(cat "$pidfile")" || true
  fi
done
sleep 2

echo "Replacing content tables"
"$RUNTIME/psql" -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
TRUNCATE TABLE
  post_tags,
  post_revisions,
  post_redirects,
  posts,
  categories,
  tags,
  series
RESTART IDENTITY CASCADE;
SQL

"$RUNTIME/pg_restore" --exit-on-error --single-transaction --disable-triggers \
  --data-only --no-owner --no-acl \
  -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  "$STAGE/content.dump"
"$RUNTIME/pg_restore" --exit-on-error --single-transaction --disable-triggers \
  --data-only --no-owner --no-acl \
  -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  "$engagement_backup"

# Must come after the content restore: the dump carries whatever renderer
# version the authoring machine had, so re-rendering earlier would be undone.
# Only posts below the current version are touched, so this is a no-op read
# on releases that did not change the renderer.
echo "Re-rendering posts below the current renderer version"
cd "$ROOT/source"
"$NODE_BIN/npm" run content:rerender

ln -sfn "$RELEASE" "$ROOT/app"
"$ROOT/deploy/start.sh"

echo "Verifying release"
"$RUNTIME/psql" -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' <<'SQL'
SELECT status, count(*) FROM posts WHERE deleted_at IS NULL GROUP BY status ORDER BY status;
SELECT 'posts_total', count(*) FROM posts WHERE deleted_at IS NULL;
SELECT 'views', count(*) FROM post_view_counts;
SELECT 'daily_rows', count(*) FROM post_view_daily;
SELECT 'migrations', count(*) FROM drizzle.__drizzle_migrations;
SQL
curl -fsS -o /dev/null -w 'home|%{http_code}\n' http://127.0.0.1:3000/
for slug in attention-residuals kimi-delta-attention stable-latent-moe; do
  curl -fsS -o /dev/null -w "$slug|%{http_code}\n" \
    "http://127.0.0.1:3000/posts/$slug"
done
echo "release=$RELEASE"
echo "backup=$full_backup"
