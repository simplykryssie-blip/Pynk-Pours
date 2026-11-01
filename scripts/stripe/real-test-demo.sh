#!/usr/bin/env bash
# REAL Stripe TEST-MODE demonstration (no real money). Requires, in a NEW session:
#   1. Network access to Stripe (api.stripe.com, checkout.stripe.com, js.stripe.com,
#      m.stripe.network, m.stripe.com, r.stripe.com, q.stripe.com, files.stripe.com, b.stripecdn.com)
#   2. STRIPE_SECRET_KEY set in the environment to a TEST key (sk_test_...)
# Webhooks are forwarded by the official Stripe CLI (docker image stripe/stripe-cli).
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY (test mode) in the environment settings}"
case "$STRIPE_SECRET_KEY" in sk_test_*|rk_test_*) ;; *) echo "Refusing: only Stripe TEST keys are allowed." >&2; exit 1;; esac
curl -sf -o /dev/null -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/balance || { echo "Cannot reach the Stripe API (network policy?)" >&2; exit 1; }

export DO_NOT_TRACK=1
pkill -f next-server 2>/dev/null || true
pkill -f stripe-double 2>/dev/null || true
docker rm -f pp-stripe-listen >/dev/null 2>&1 || true

# Webhook signing secret for this CLI session (test mode).
WHSEC=$(docker run --rm --network host -e STRIPE_API_KEY="$STRIPE_SECRET_KEY" stripe/stripe-cli:latest listen --print-secret)
docker run -d --name pp-stripe-listen --network host -e STRIPE_API_KEY="$STRIPE_SECRET_KEY" stripe/stripe-cli:latest \
  listen --forward-to http://localhost:3123/api/stripe/webhook \
  --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,charge.refunded,charge.refund.updated,payment_intent.payment_failed >/dev/null

scripts/db/reset-local-demo.sh >/dev/null
npm run -s build >/dev/null

# Real Stripe: the local test double settings must NOT be active.
( env -u STRIPE_API_BASE -u PYNKPOURS_LOCAL_TEST STRIPE_WEBHOOK_SECRET="$WHSEC" CHECKOUT_ENABLED=true \
    npx next start -p 3123 > /tmp/pynkpours-real-stripe.log 2>&1 & )
for i in $(seq 1 30); do curl -sf -o /dev/null http://localhost:3123 && break; sleep 1; done

STRIPE_REAL_DEMO=1 STRIPE_WEBHOOK_SECRET="$WHSEC" npx playwright test -c playwright.demo.config.ts tests/demo/stripe-real.spec.ts
echo "Screenshots: docs/qa/stage-d-real/   Stripe CLI log: docker logs pp-stripe-listen"
