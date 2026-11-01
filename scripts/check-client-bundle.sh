#!/usr/bin/env bash
# Fails if anything that looks like a server secret appears in the browser bundle.
# Run after `next build`.
set -euo pipefail
DIR=".next/static"
[ -d "$DIR" ] || { echo "No $DIR — run 'npm run build' first" >&2; exit 2; }
PATTERN='sk_(test|live)_[A-Za-z0-9]{8,}|rk_(test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9_-]{8,}|service_role|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY|TICKET_CREDENTIAL_KEY|RATE_LIMIT_SALT|CRON_SECRET|RESEND_API_KEY'
if grep -rEo "$PATTERN" "$DIR" ; then
  echo "FAIL: possible secret material in client bundle" >&2
  exit 1
fi
echo "OK: no secret patterns found in $DIR"
