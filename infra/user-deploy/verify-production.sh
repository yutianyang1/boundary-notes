#!/usr/bin/env bash
set -euo pipefail

ROOT=/home/yty/blog
RUNTIME="$ROOT/runtime/bin"

set -a
. "$ROOT/.env"
set +a

if [ "${UPLOADS_DIR:-}" != "$ROOT/uploads" ]; then
  echo "UPLOADS_DIR is not configured for persistent storage" >&2
  exit 1
fi

test -d "$UPLOADS_DIR/avatars"
test -w "$UPLOADS_DIR/avatars"
echo "uploads_dir=$UPLOADS_DIR"

audit_table=$(
  "$RUNTIME/psql" -v ON_ERROR_STOP=1 \
    -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At <<'SQL'
SELECT to_regclass('public.audit_logs');
SQL
)

if [ "$audit_table" != "audit_logs" ]; then
  echo "audit_logs table is missing" >&2
  exit 1
fi
echo "audit_table=$audit_table"

mail_key_bytes=$(printf '%s' "$MAIL_OUTBOX_KEY" | base64 -d | wc -c)
if [ "$mail_key_bytes" -ne 32 ]; then
  echo "MAIL_OUTBOX_KEY is not a valid 32-byte key" >&2
  exit 1
fi
echo "mail_outbox_key_bytes=$mail_key_bytes"

case "${MAIL_PROVIDER:-}" in
  smtp)
    test -n "${SMTP_HOST:-}" && test -n "${SMTP_FROM:-}" || {
      echo "SMTP_HOST and SMTP_FROM are required for MAIL_PROVIDER=smtp" >&2
      exit 1
    }
    ;;
  tencent_api)
    for name in TENCENT_SECRET_ID TENCENT_SECRET_KEY TENCENT_SES_REGION MAIL_FROM_ADDRESS MAIL_FROM_NAME \
      SES_TEMPLATE_VERIFY_EMAIL SES_TEMPLATE_SUBSCRIBE_CONFIRM SES_TEMPLATE_POST_PUBLISHED \
      SES_TEMPLATE_PASSWORD_RESET SES_TEMPLATE_SECURITY_ALERT; do
      test -n "${!name:-}" || {
        echo "$name is required for MAIL_PROVIDER=tencent_api" >&2
        exit 1
      }
    done
    case "$TENCENT_SES_REGION" in
      ap-guangzhou|ap-hongkong) ;;
      *) echo "TENCENT_SES_REGION must be ap-guangzhou or ap-hongkong" >&2; exit 1 ;;
    esac
    case "$MAIL_FROM_ADDRESS" in
      *@mail.xiudou.site) ;;
      *) echo "MAIL_FROM_ADDRESS must use mail.xiudou.site" >&2; exit 1 ;;
    esac
    echo "mail_provider=tencent_api"
    ;;
  *)
    echo "MAIL_PROVIDER must be smtp or tencent_api" >&2
    exit 1
    ;;
esac

"$ROOT/preflight.sh"
