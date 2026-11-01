/**
 * Trusted staff bootstrap (e.g. the very first OWNER account). Staff are never
 * created through public sign-up. Uses the Supabase SECRET key from the
 * environment — run it on your own machine; never paste keys into chat.
 *
 *   npx tsx --env-file=.env.local scripts/create-staff.mts --email you@example.com --name "Your Name" --role owner
 *
 * Refuses non-local Supabase URLs unless --allow-remote is passed (for the
 * owner to bootstrap production after approval). Prints a temporary password
 * once; the person sets up their authenticator app at first sign-in.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "checkin" },
    password: { type: "string" }, "allow-remote": { type: "boolean", default: false },
  },
});
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url) && !values["allow-remote"]) {
  console.error(`Refusing to create staff on non-local Supabase (${new URL(url).host}) without --allow-remote.`);
  process.exit(1);
}
if (!values.email || !values.name || !["owner", "admin", "checkin"].includes(values.role!)) {
  console.error("Usage: --email <email> --name <name> --role owner|admin|checkin [--password <pw>]");
  process.exit(1);
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const password = values.password ?? `${Array.from(randomBytes(20), (b) => alphabet[b % alphabet.length]).join("")}-Aa9`;

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.createUser({ email: values.email, password, email_confirm: true });
if (error || !data.user) throw new Error(`Could not create user: ${error?.message}`);
const { error: pErr } = await admin.from("admin_profiles").insert({ user_id: data.user.id, role: values.role, display_name: values.name });
if (pErr) {
  await admin.auth.admin.deleteUser(data.user.id);
  throw new Error(`Could not grant role: ${pErr.message}`);
}
console.log(`Created ${values.role} ${values.email}`);
if (!values.password) console.log(`Temporary password (shown once): ${password}`);
