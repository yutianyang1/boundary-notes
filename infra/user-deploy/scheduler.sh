#!/usr/bin/env bash
set -u

while true; do
  sleep 60
  curl --fail --silent --show-error --max-time 30 -X POST \
    -H "Authorization: Bearer $JOB_SECRET" \
    http://127.0.0.1:3000/internal/jobs/publish-scheduled || true
  curl --fail --silent --show-error --max-time 30 -X POST \
    -H "Authorization: Bearer $JOB_SECRET" \
    http://127.0.0.1:3000/internal/jobs/send-mail || true
done
