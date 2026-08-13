#!/usr/bin/env bash
set -euo pipefail

install -o root -g root -m 644 \
  /home/yty/blog/tls-staging/xiudou.site.conf \
  /etc/nginx/sites-available/xiudou.site.conf

nginx -t
systemctl restart nginx
echo "Nginx configuration activated."
