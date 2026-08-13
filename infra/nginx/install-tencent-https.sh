#!/usr/bin/env bash
set -euo pipefail

STAGE=/home/yty/blog/tls-staging
TLS_DIR=/etc/nginx/tls/xiudou.site
SITE_SOURCE="$STAGE/xiudou.site.conf"
SITE_TARGET=/etc/nginx/sites-available/xiudou.site.conf

test "$(id -u)" -eq 0 || {
  echo "Run this script with sudo." >&2
  exit 1
}
test -f "$STAGE/fullchain.pem"
test -f "$STAGE/privkey.pem"
test -f "$SITE_SOURCE"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx

install -d -o root -g root -m 700 "$TLS_DIR"
install -o root -g root -m 644 "$STAGE/fullchain.pem" "$TLS_DIR/fullchain.pem"
install -o root -g root -m 600 "$STAGE/privkey.pem" "$TLS_DIR/privkey.pem"
install -o root -g root -m 644 "$SITE_SOURCE" "$SITE_TARGET"
ln -sfn "$SITE_TARGET" /etc/nginx/sites-enabled/xiudou.site.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

# The staged private key is no longer needed after the root-only copy exists.
rm -f "$STAGE/privkey.pem"
echo "Nginx HTTPS configuration installed successfully."
