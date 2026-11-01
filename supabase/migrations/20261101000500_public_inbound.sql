-- PynkPours — 0005 Public inbound data: contact form, newsletter, event
-- interest ("Get notified" / optional waitlist), and rate limiting.
-- All inserts come from server actions (secret key) after validation + rate limit.

create table public.contact_submissions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 160),
  email       text not null check (email = lower(btrim(email)) and char_length(email) <= 254),
  subject     text check (subject is null or char_length(subject) <= 200),
  topic       text not null default 'general' check (topic in ('general', 'partnership', 'event', 'press')),
  message     text not null check (char_length(message) between 1 and 5000),
  status      text not null default 'new' check (status in ('new', 'handled', 'spam')),
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index contact_submissions_created_idx on public.contact_submissions (created_at desc);

create table public.newsletter_subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique check (email = lower(btrim(email)) and char_length(email) <= 254),
  source           text check (source is null or char_length(source) <= 60),
  consented_at     timestamptz not null default now(),
  unsubscribed_at  timestamptz,
  created_at       timestamptz not null default now()
);

-- Covers both "Coming soon — get notified" and the optional sold-out waitlist.
create table public.event_interest (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete restrict,
  kind        text not null check (kind in ('notify', 'waitlist')),
  name        text check (name is null or char_length(name) <= 160),
  email       text not null check (email = lower(btrim(email)) and char_length(email) <= 254),
  quantity    integer check (quantity is null or quantity between 1 and 50),
  status      text not null default 'new' check (status in ('new', 'contacted', 'converted', 'removed')),
  created_at  timestamptz not null default now(),
  constraint event_interest_unique unique (event_id, kind, email)
);

-- ---------------------------------------------------------------------------
-- Fixed-window rate limiting. key_hash = HMAC/SHA-256 of IP (+ salt) computed
-- by the app server; raw IPs are never stored.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  bucket       text not null check (char_length(bucket) between 1 and 60),
  key_hash     text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, key_hash, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);
