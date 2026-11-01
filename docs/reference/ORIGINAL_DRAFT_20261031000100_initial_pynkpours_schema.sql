-- PynkPours initial database foundation
-- Apply to a NEW PynkPours Supabase project only after reviewing the migration.
-- Guest checkout; admin-only management; no attendee accounts.

create extension if not exists pgcrypto;

create type public.event_status as enum ('draft', 'published', 'cancelled', 'completed');
create type public.ticket_sale_status as enum ('active', 'paused', 'sold_out', 'closed');
create type public.order_status as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded');
create type public.ticket_status as enum ('valid', 'checked_in', 'cancelled', 'refunded');

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  short_description text,
  description text,
  cover_image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'America/Chicago',
  venue_name text,
  venue_address text,
  agenda jsonb not null default '[]'::jsonb,
  faqs jsonb not null default '[]'::jsonb,
  registration_mode text not null default 'tickets' check (registration_mode in ('tickets','coming_soon','closed')),
  sold_out_behavior text not null default 'sold_out' check (sold_out_behavior in ('sold_out','waitlist')),
  status public.event_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  capacity integer check (capacity is null or capacity >= 0),
  quantity_sold integer not null default 0 check (quantity_sold >= 0),
  max_per_order integer check (max_per_order is null or max_per_order > 0),
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  sort_order integer not null default 0,
  status public.ticket_sale_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (capacity is null or quantity_sold <= capacity)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  event_id uuid not null references public.events(id),
  purchaser_name text not null,
  purchaser_email text not null,
  purchaser_phone text,
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status public.order_status not null default 'pending',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  full_name text not null,
  email text not null,
  phone text,
  dietary_or_accessibility_notes text,
  created_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null unique references public.attendees(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_id uuid not null references public.events(id),
  ticket_type_id uuid not null references public.ticket_types(id),
  credential_hash text not null unique,
  status public.ticket_status not null default 'valid',
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  check (status <> 'checked_in' or checked_in_at is not null)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id),
  event_id uuid not null references public.events(id),
  scanned_by uuid references auth.users(id),
  scanned_at timestamptz not null default now(),
  result text not null check (result in ('accepted','already_checked_in','invalid','wrong_event','refunded','cancelled'))
);

create index events_public_listing_idx on public.events (starts_at) where status = 'published';
create index ticket_types_event_idx on public.ticket_types (event_id, sort_order);
create index orders_event_status_idx on public.orders (event_id, status);
create index attendees_order_idx on public.attendees (order_id);
create index tickets_event_status_idx on public.tickets (event_id, status);
create index check_ins_event_scanned_idx on public.check_ins (event_id, scanned_at desc);

-- Keep updated_at current on editable records.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger ticket_types_set_updated_at before update on public.ticket_types
for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

-- Admin check is based on a row in admin_profiles, not a user-editable metadata flag.
create or replace function public.is_pynkpours_admin()
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (
    select 1 from public.admin_profiles ap
    where ap.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_pynkpours_admin() from public;
grant execute on function public.is_pynkpours_admin() to authenticated;

alter table public.admin_profiles enable row level security;
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.orders enable row level security;
alter table public.attendees enable row level security;
alter table public.tickets enable row level security;
alter table public.check_ins enable row level security;

-- Public visitors may only read published event content and active ticket options.
create policy "public can read published events" on public.events
for select to anon, authenticated using (status = 'published');
create policy "admins manage events" on public.events
for all to authenticated using (public.is_pynkpours_admin()) with check (public.is_pynkpours_admin());

create policy "public can read active tickets for published events" on public.ticket_types
for select to anon, authenticated using (
  status = 'active' and exists (
    select 1 from public.events e where e.id = event_id and e.status = 'published'
  )
);
create policy "admins manage ticket types" on public.ticket_types
for all to authenticated using (public.is_pynkpours_admin()) with check (public.is_pynkpours_admin());

-- No public policies on orders, attendees, tickets, or check_ins.
-- Checkout, Stripe webhooks, ticket issuance, and QR validation must use trusted
-- server-side functions with the Supabase service role kept server-side only.
create policy "admins read orders" on public.orders
for select to authenticated using (public.is_pynkpours_admin());
create policy "admins read attendees" on public.attendees
for select to authenticated using (public.is_pynkpours_admin());
create policy "admins read tickets" on public.tickets
for select to authenticated using (public.is_pynkpours_admin());
create policy "admins read checkins" on public.check_ins
for select to authenticated using (public.is_pynkpours_admin());
create policy "admins read own admin profile" on public.admin_profiles
for select to authenticated using (user_id = (select auth.uid()) and public.is_pynkpours_admin());

-- Prevent direct client-side writes to sensitive commerce tables. Server-side
-- service-role handlers are responsible for all order/ticket/check-in mutations.
revoke insert, update, delete on public.orders, public.attendees, public.tickets, public.check_ins from anon, authenticated;
revoke insert, update, delete on public.admin_profiles from anon, authenticated;

comment on table public.events is 'Public PynkPours events; publish state controls public visibility.';
comment on table public.ticket_types is 'Per-event configurable ticket tiers, including optional VIP tiers.';
comment on table public.orders is 'Purchaser and Stripe payment record; guest checkout only.';
comment on table public.attendees is 'One attendee record per purchased ticket; no attendee login.';
comment on table public.tickets is 'One unique hashed QR credential per attendee ticket.';
comment on table public.check_ins is 'Append-only scan history for event attendance.';
