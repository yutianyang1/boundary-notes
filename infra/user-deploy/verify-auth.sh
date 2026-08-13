#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
NODE=/home/yty/.nvm/versions/node/v24.15.0/bin/node
BASE=http://127.0.0.1:3000
COOKIE="$ROOT/run/auth-check.cookies"

set -a
. "$ROOT/.env"
set +a

rm -f "$COOKIE"
csrf=$(curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
  --cookie-jar "$COOKIE" "$BASE/api/auth/csrf" |
  "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).csrfToken))')

curl --fail --silent --show-error --connect-timeout 5 --max-time 45 \
  --output /dev/null --cookie "$COOKIE" --cookie-jar "$COOKIE" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$csrf" \
  --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "password=$ADMIN_PASSWORD" \
  --data-urlencode "callbackUrl=$BASE/admin" \
  "$BASE/api/auth/callback/credentials"

curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
  --cookie "$COOKIE" "$BASE/api/auth/session" |
  "$NODE" -e '
let s="";
process.stdin.on("data",d=>s+=d).on("end",()=>{
  const session=JSON.parse(s);
  if(session.user?.email!==process.env.ADMIN_EMAIL) process.exit(1);
  process.stdout.write(`Authenticated as ${session.user.email}\n`);
});'

curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
  --cookie "$COOKIE" "$BASE/account" |
  grep --quiet "登录设备"
echo "Account center rendered successfully"

rm -f "$COOKIE"
