#!/usr/bin/env bash
# LOCAL ONLY: rebuild the local Supabase database, load SAMPLE data and demo staff.
set -euo pipefail
export DO_NOT_TRACK=1
npx supabase db reset --local
npx tsx --env-file=.env.local scripts/db/seed-local-sample.ts
npx tsx --env-file=.env.local scripts/create-staff.mts --email owner@pynkpours.test --name "Demo Owner" --role owner --password 'DemoOwner-Local-2026'
npx tsx --env-file=.env.local scripts/create-staff.mts --email door@pynkpours.test --name "Demo Door Staff" --role checkin --password 'DemoDoor-Local-2026'
rm -rf test-results/.admin-auth
echo "Local demo data ready (SAMPLE events/orders; demo staff owner@ / door@pynkpours.test)."
