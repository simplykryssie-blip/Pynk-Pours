-- PynkPours — 0002 Core tables: staff, events, ticket types, event questions.

-- ---------------------------------------------------------------------------
-- Staff (admins + check-in staff). Created ONLY by a trusted server-side
-- script / owner action using the secret key. Never by public signup.
-- ---------------------------------------------------------------------------
create table public.admin_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  role         public.staff_role not null default 'checkin',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger admin_profiles_set_updated_at
  before update on public.admin_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique
                           check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title                  text not null check (char_length(title) between 1 and 160),
  short_description      text check (short_description is null or char_length(short_description) <= 400),
  description            text check (description is null or char_length(description) <= 20000),
  category_label         text check (category_label is null or char_length(category_label) <= 60),
  cover_image_path       text check (cover_image_path is null or char_length(cover_image_path) <= 500),
  cover_image_alt        text check (cover_image_alt is null or char_length(cover_image_alt) <= 300),
  starts_at              timestamptz,
  ends_at                timestamptz,
  -- IANA timezone; validated by trigger. No silent default: must be chosen.
  timezone               text,
  is_online              boolean not null default false,
  venue_name             text check (venue_name is null or char_length(venue_name) <= 200),
  venue_address          text check (venue_address is null or char_length(venue_address) <= 500),
  venue_notes            text check (venue_notes is null or char_length(venue_notes) <= 2000),
  dress_code             text check (dress_code is null or char_length(dress_code) <= 300),
  parking_info           text check (parking_info is null or char_length(parking_info) <= 2000),
  accessibility_info     text check (accessibility_info is null or char_length(accessibility_info) <= 2000),
  refund_policy          text check (refund_policy is null or char_length(refund_policy) <= 4000),
  min_age                smallint check (min_age is null or min_age between 1 and 99),
  -- [{ "time": "11:00", "title": "...", "description": "..." }]
  agenda                 jsonb not null default '[]'::jsonb check (jsonb_typeof(agenda) = 'array'),
  -- [{ "name": "...", "title": "...", "bio": "...", "image_path": "..." }]
  speakers               jsonb not null default '[]'::jsonb check (jsonb_typeof(speakers) = 'array'),
  -- [{ "question": "...", "answer": "..." }]
  faqs                   jsonb not null default '[]'::jsonb check (jsonb_typeof(faqs) = 'array'),
  currency               text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  -- Optional total admissions cap across all ticket types (e.g. venue capacity).
  capacity               integer check (capacity is null or capacity >= 0),
  -- Admissions sold (paid, not released). Maintained ONLY by trusted RPCs.
  admissions_sold        integer not null default 0 check (admissions_sold >= 0),
  max_tickets_per_order  integer not null default 10 check (max_tickets_per_order between 1 and 50),
  show_remaining_count   boolean not null default false,
  registration_mode      public.registration_mode not null default 'coming_soon',
  sold_out_behavior      public.sold_out_behavior not null default 'sold_out',
  status                 public.event_status not null default 'draft',
  is_featured            boolean not null default false,
  published_at           timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint events_not_oversold check (capacity is null or admissions_sold <= capacity),
  constraint events_time_order check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint events_cancelled_at check ((status = 'cancelled') = (cancelled_at is not null))
);

create index events_public_listing_idx on public.events (starts_at) where status <> 'draft';

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- Validate timezone, guard publishing, protect currency once orders exist.
create or replace function public.events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid IANA timezone: %', new.timezone using errcode = '22023';
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    if new.starts_at is null or new.timezone is null
       or new.short_description is null
       or (not new.is_online and new.venue_name is null) then
      raise exception 'Event cannot be published: starts_at, timezone, short_description and venue (or is_online) are required'
        using errcode = '23514';
    end if;
    if new.registration_mode = 'tickets' and not exists (
      select 1 from public.ticket_types t where t.event_id = new.id
    ) then
      raise exception 'Event cannot be published in ticket mode without at least one ticket type'
        using errcode = '23514';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := now();
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;

  if tg_op = 'UPDATE' and new.currency <> old.currency
     and exists (select 1 from public.orders o where o.event_id = new.id) then
    raise exception 'Currency cannot change after orders exist' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Separate INSERT handling (OLD is null on insert).
create or replace function public.events_guard_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid IANA timezone: %', new.timezone using errcode = '22023';
  end if;
  if new.status <> 'draft' then
    raise exception 'New events must be created as draft' using errcode = '23514';
  end if;
  new.published_at := null;
  new.cancelled_at := null;
  return new;
end;
$$;

create trigger events_guard_insert
  before insert on public.events
  for each row execute function public.events_guard_insert();

create trigger events_guard_update
  before update on public.events
  for each row execute function public.events_guard();

-- ---------------------------------------------------------------------------
-- Ticket types (per-event tiers; VIP is just a label, never required)
-- ---------------------------------------------------------------------------
create table public.ticket_types (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete restrict,
  name            text not null check (char_length(name) between 1 and 120),
  description     text check (description is null or char_length(description) <= 2000),
  -- Bullet list of inclusions shown on the ticket card.
  inclusions      jsonb not null default '[]'::jsonb check (jsonb_typeof(inclusions) = 'array'),
  price_cents     integer not null check (price_cents >= 0 and price_cents <= 10000000),
  -- One purchased unit admits this many people (e.g. a table for 4). Each admission
  -- gets its own attendee record and its own QR ticket.
  admits_per_unit integer not null default 1 check (admits_per_unit between 1 and 20),
  -- Units available. NULL = limited only by event capacity.
  capacity        integer check (capacity is null or capacity >= 0),
  -- Units sold (paid). Maintained ONLY by trusted RPCs; not client-writable.
  quantity_sold   integer not null default 0 check (quantity_sold >= 0),
  max_per_order   integer check (max_per_order is null or max_per_order between 1 and 50),
  sales_start_at  timestamptz,
  sales_end_at    timestamptz,
  sort_order      integer not null default 0,
  status          public.ticket_sale_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint ticket_types_id_event_unique unique (id, event_id),
  constraint ticket_types_sales_window check (
    sales_end_at is null or sales_start_at is null or sales_end_at > sales_start_at
  ),
  constraint ticket_types_not_oversold check (capacity is null or quantity_sold <= capacity)
);

create index ticket_types_event_idx on public.ticket_types (event_id, sort_order);

-- admits_per_unit cannot change once the tier has been reserved or sold, because
-- inventory and attendee counts depend on it.
create or replace function public.ticket_types_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.admits_per_unit <> old.admits_per_unit
     and (old.quantity_sold > 0
          or exists (select 1 from public.order_items oi where oi.ticket_type_id = old.id)) then
    raise exception 'admits_per_unit cannot change after the ticket type has orders'
      using errcode = '23514';
  end if;
  if new.event_id <> old.event_id then
    raise exception 'ticket type cannot move to another event' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger ticket_types_guard
  before update on public.ticket_types
  for each row execute function public.ticket_types_guard();

create trigger ticket_types_set_updated_at
  before update on public.ticket_types
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Optional per-event attendee questions (replaces free-text health notes)
-- ---------------------------------------------------------------------------
create table public.event_questions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete restrict,
  label       text not null check (char_length(label) between 1 and 200),
  help_text   text check (help_text is null or char_length(help_text) <= 500),
  kind        text not null default 'text' check (kind in ('text', 'select', 'checkbox')),
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  is_required boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index event_questions_event_idx on public.event_questions (event_id, sort_order);

create trigger event_questions_set_updated_at
  before update on public.event_questions
  for each row execute function public.set_updated_at();
