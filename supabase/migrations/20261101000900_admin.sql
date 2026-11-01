-- PynkPours — 0009 Admin dashboard support (Stage C).
--
--  * Staff permissions now REQUIRE an MFA-verified session (JWT aal = 'aal2').
--    A stolen password alone (aal1) grants no admin data, even via the raw API.
--  * Archive: hides an event from the public site without deleting anything.
--  * Event-level registration deadline that caps every tier's sales window.
--  * Event media library (Supabase Storage bucket "event-media").
--  * Admin RPCs: duplicate event, reorder tiers, edit attendee, dashboard and
--    per-tier statistics. All audited where they change data.

-- ---------------------------------------------------------------------------
-- 1) MFA-enforced staff role
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select ap.role
  from public.admin_profiles ap
  where ap.user_id = (select auth.uid())
    and ap.is_active
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

-- ---------------------------------------------------------------------------
-- 2) Archive + registration deadline
-- ---------------------------------------------------------------------------
alter table public.events
  add column archived_at timestamptz,
  add column registration_closes_at timestamptz;

create index events_archived_idx on public.events (archived_at);

-- Public visibility now also excludes archived events.
drop policy events_public_read on public.events;
create policy events_public_read on public.events
  for select to anon, authenticated
  using (status <> 'draft' and published_at is not null and archived_at is null);

drop policy event_questions_public_read on public.event_questions;
create policy event_questions_public_read on public.event_questions
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and e.status <> 'draft' and e.published_at is not null and e.archived_at is null));

grant select (registration_closes_at, archived_at) on public.events to anon;
grant insert (registration_closes_at) on public.events to authenticated;
grant update (registration_closes_at, archived_at) on public.events to authenticated;

create or replace function public.events_archive_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    -- Archiving unpublishes and un-features the event.
    new.is_featured := false;
    if new.status = 'published' then
      new.status := 'draft';
    end if;
  elsif new.archived_at is not null and new.status = 'published' then
    raise exception 'Archived events cannot be published. Unarchive first.' using errcode = '23514';
  end if;
  if new.registration_closes_at is not null and new.ends_at is not null
     and new.registration_closes_at > new.ends_at then
    raise exception 'Registration deadline must be before the event ends' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger events_archive_guard
  before update on public.events
  for each row execute function public.events_archive_guard();

-- Orders can never be created for archived events (defence in depth for checkout).
create or replace function public.orders_event_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.events e where e.id = new.event_id and e.archived_at is not null) then
    raise exception 'event_unavailable' using errcode = 'P0001', detail = 'Event is archived';
  end if;
  return new;
end;
$$;

create trigger orders_event_guard
  before insert on public.orders
  for each row execute function public.orders_event_guard();

-- Sales end = earliest of: tier end, event registration deadline, event end (or start).
create or replace function public._sales_end(p_type public.ticket_types, p_event public.events)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select nullif(least(
    coalesce(p_type.sales_end_at, 'infinity'::timestamptz),
    coalesce(p_event.registration_closes_at, 'infinity'::timestamptz),
    coalesce(p_event.ends_at, p_event.starts_at, 'infinity'::timestamptz)
  ), 'infinity'::timestamptz);
$$;

-- Ticket options: public sees visible events; admins may also preview drafts
-- (computed as if published) for the "preview before publishing" feature.
create or replace function public.get_event_ticket_options(p_event_id uuid)
returns table (
  id               uuid,
  name             text,
  description      text,
  inclusions       jsonb,
  price_cents      integer,
  currency         text,
  admits_per_unit  integer,
  sort_order       integer,
  sales_start_at   timestamptz,
  sales_end_at     timestamptz,
  display_state    text,
  remaining        integer,
  max_purchasable  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.events;
  t public.ticket_types;
  v_now timestamptz := now();
  v_event_left integer;
  v_type_left integer;
  v_left integer;
  v_state text;
  v_status public.event_status;
  v_end timestamptz;
begin
  select * into e from public.events ev
  where ev.id = p_event_id
    and ((ev.status <> 'draft' and ev.published_at is not null and ev.archived_at is null)
         or public.is_admin());
  if not found then
    return;
  end if;

  v_status := case when e.status = 'draft' then 'published'::public.event_status else e.status end;
  v_event_left := public._event_remaining_admissions(e.id);

  for t in
    select * from public.ticket_types tt where tt.event_id = e.id
    order by tt.sort_order, tt.created_at
  loop
    v_type_left := public._ticket_type_remaining_units(t.id);
    v_left := least(
      coalesce(v_type_left, 2147483647),
      coalesce(v_event_left / t.admits_per_unit, 2147483647)
    );
    v_end := public._sales_end(t, e);

    v_state := case
      when v_status <> 'published' or e.archived_at is not null then 'closed'
      when e.registration_mode = 'coming_soon' then 'coming_soon'
      when e.registration_mode = 'closed' then 'closed'
      when t.status = 'paused' then 'paused'
      when t.status = 'closed' then 'closed'
      when t.sales_start_at is not null and v_now < t.sales_start_at then 'scheduled'
      when v_end is not null and v_now >= v_end then 'ended'
      when v_left <= 0 then 'sold_out'
      else 'on_sale'
    end;

    id := t.id; name := t.name; description := t.description; inclusions := t.inclusions;
    price_cents := t.price_cents; currency := e.currency; admits_per_unit := t.admits_per_unit;
    sort_order := t.sort_order; sales_start_at := t.sales_start_at; sales_end_at := v_end;
    display_state := v_state;
    remaining := case when v_state = 'on_sale' and e.show_remaining_count and v_left < 2147483647
                      then v_left end;
    max_purchasable := case when v_state = 'on_sale'
                            then greatest(0, least(v_left,
                                   coalesce(t.max_per_order, 50),
                                   e.max_tickets_per_order / t.admits_per_unit))
                            else 0 end;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Event media library
-- ---------------------------------------------------------------------------
create table public.event_media (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete restrict,
  storage_path    text not null unique check (storage_path ~ '^events/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$'),
  alt_text        text check (alt_text is null or char_length(alt_text) <= 300),
  width           integer check (width > 0),
  height          integer check (height > 0),
  bytes           integer check (bytes > 0),
  show_in_gallery boolean not null default false,
  sort_order      integer not null default 0,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint event_media_path_matches_event check (storage_path like 'events/' || event_id::text || '/%')
);
create index event_media_event_idx on public.event_media (event_id, sort_order);

alter table public.event_media enable row level security;

create policy event_media_public_read on public.event_media
  for select to anon, authenticated
  using (show_in_gallery and exists (
    select 1 from public.events e
    where e.id = event_id and e.status <> 'draft' and e.published_at is not null and e.archived_at is null));
create policy event_media_admin_all on public.event_media
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select (id, event_id, storage_path, alt_text, width, height, show_in_gallery, sort_order)
  on public.event_media to anon;
grant select on public.event_media to authenticated;
grant insert (event_id, storage_path, alt_text, width, height, bytes, show_in_gallery, sort_order, created_by)
  on public.event_media to authenticated;
grant update (alt_text, show_in_gallery, sort_order) on public.event_media to authenticated;
grant delete on public.event_media to authenticated;

create trigger event_media_audit after insert or update or delete on public.event_media
  for each row execute function public.audit_row_change('id');

-- Storage bucket + policies (only where Supabase Storage exists; the plain-Postgres
-- test harness has no storage schema). Public read via public URL; only MFA-verified
-- admins may write. No SELECT policy => objects cannot be listed through the API.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('event-media', 'event-media', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
    on conflict (id) do update
      set public = excluded.public, file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;

    execute $p$create policy "pynkpours admins upload event media" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'event-media' and (select public.is_admin()))$p$;
    execute $p$create policy "pynkpours admins update event media" on storage.objects
      for update to authenticated
      using (bucket_id = 'event-media' and (select public.is_admin()))$p$;
    execute $p$create policy "pynkpours admins delete event media" on storage.objects
      for delete to authenticated
      using (bucket_id = 'event-media' and (select public.is_admin()))$p$;
  else
    raise notice 'storage schema not present; skipping bucket setup';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Admin RPCs
-- ---------------------------------------------------------------------------

-- Duplicate an event (content, tiers, questions) as a new DRAFT. Sales counters,
-- media and publish state are NOT copied.
create or replace function public.admin_duplicate_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  src public.events;
  v_new uuid;
  v_slug text;
  v_n integer := 1;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into src from public.events where id = p_event_id;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  v_slug := left(src.slug, 70) || '-copy';
  while exists (select 1 from public.events where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := left(src.slug, 70) || '-copy-' || v_n;
  end loop;

  insert into public.events (
    slug, title, short_description, description, category_label, cover_image_alt,
    starts_at, ends_at, timezone, is_online, venue_name, venue_address, venue_notes, dress_code,
    parking_info, accessibility_info, refund_policy, min_age, agenda, speakers, faqs, currency,
    capacity, max_tickets_per_order, show_remaining_count, registration_mode, sold_out_behavior,
    registration_closes_at)
  values (
    v_slug, left(src.title || ' (copy)', 160), src.short_description, src.description,
    src.category_label, src.cover_image_alt, src.starts_at, src.ends_at, src.timezone,
    src.is_online, src.venue_name, src.venue_address, src.venue_notes, src.dress_code,
    src.parking_info, src.accessibility_info, src.refund_policy, src.min_age, src.agenda,
    src.speakers, src.faqs, src.currency, src.capacity, src.max_tickets_per_order,
    src.show_remaining_count, src.registration_mode, src.sold_out_behavior,
    src.registration_closes_at)
  returning id into v_new;

  insert into public.ticket_types (event_id, name, description, inclusions, price_cents,
                                   admits_per_unit, capacity, max_per_order, sales_start_at,
                                   sales_end_at, sort_order, status)
  select v_new, name, description, inclusions, price_cents, admits_per_unit, capacity,
         max_per_order, sales_start_at, sales_end_at, sort_order, status
  from public.ticket_types where event_id = src.id;

  insert into public.event_questions (event_id, label, help_text, kind, options, is_required, sort_order)
  select v_new, label, help_text, kind, options, is_required, sort_order
  from public.event_questions where event_id = src.id;

  perform public.write_audit('event.duplicate', 'event', v_new::text, null, null,
                             jsonb_build_object('source_event_id', src.id));
  return v_new;
end;
$$;

create or replace function public.admin_reorder_ticket_types(p_event_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select count(*) from public.ticket_types where event_id = p_event_id) <> cardinality(p_ids)
     or exists (select 1 from unnest(p_ids) x
                where not exists (select 1 from public.ticket_types t where t.id = x and t.event_id = p_event_id)) then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'ids must be exactly the event''s ticket types';
  end if;
  update public.ticket_types t
     set sort_order = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where t.id = o.id;
end;
$$;

-- Correct an attendee's name / email / phone (e.g. a typo). Audited with before/after.
create or replace function public.admin_update_attendee(
  p_attendee_id uuid, p_full_name text, p_email text, p_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object('full_name', full_name, 'email', email, 'phone', phone)
    into v_before from public.attendees where id = p_attendee_id;
  if v_before is null then
    raise exception 'attendee_not_found' using errcode = 'P0001';
  end if;
  update public.attendees
     set full_name = btrim(p_full_name), email = lower(btrim(p_email)), phone = nullif(btrim(p_phone), '')
   where id = p_attendee_id
  returning jsonb_build_object('full_name', full_name, 'email', email, 'phone', phone) into v_after;
  perform public.write_audit('attendee.update', 'attendee', p_attendee_id::text, v_before, v_after);
end;
$$;

-- Per-event summary rows for the dashboard and events list. Financial columns are
-- NULL unless the caller is an owner/admin (check-in staff never see money).
create or replace function public.admin_events_overview()
returns table (
  id               uuid,
  slug             text,
  title            text,
  status           public.event_status,
  registration_mode public.registration_mode,
  starts_at        timestamptz,
  ends_at          timestamptz,
  timezone         text,
  archived_at      timestamptz,
  is_featured      boolean,
  capacity         integer,
  tickets_valid    integer,
  checked_in       integer,
  orders_paid      integer,
  gross_cents      bigint,
  refunded_cents   bigint,
  currency         text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_finance boolean := public.is_admin();
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select e.id, e.slug, e.title, e.status, e.registration_mode, e.starts_at, e.ends_at,
           e.timezone, e.archived_at, e.is_featured, e.capacity,
           (select count(*)::integer from public.tickets t where t.event_id = e.id and t.status = 'valid'),
           (select count(*)::integer from public.tickets t
             where t.event_id = e.id and t.status = 'valid' and t.checked_in_at is not null),
           case when v_finance then (select count(*)::integer from public.orders o
             where o.event_id = e.id and o.status in ('paid', 'partially_refunded', 'refunded')) end,
           case when v_finance then (select coalesce(sum(o.total_cents), 0)::bigint from public.orders o
             where o.event_id = e.id and o.status in ('paid', 'partially_refunded', 'refunded')) end,
           case when v_finance then (select coalesce(sum(o.amount_refunded_cents), 0)::bigint
             from public.orders o where o.event_id = e.id) end,
           e.currency
    from public.events e
    -- Check-in staff only see events that are visible publicly (not drafts/archived).
    where v_finance or (e.status <> 'draft' and e.archived_at is null)
    order by e.starts_at nulls last, e.created_at desc;
end;
$$;

-- Per-tier inventory for the ticket builder.
create or replace function public.admin_ticket_type_stats(p_event_id uuid)
returns table (
  ticket_type_id uuid,
  units_sold     integer,
  units_held     integer,
  units_remaining integer,
  has_orders     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select t.id, t.quantity_sold,
           coalesce((select sum(h.quantity)::integer from public.inventory_holds h
                     where h.ticket_type_id = t.id and h.status = 'active' and h.expires_at > now()), 0),
           public._ticket_type_remaining_units(t.id),
           exists (select 1 from public.order_items oi where oi.ticket_type_id = t.id)
    from public.ticket_types t
    where t.event_id = p_event_id
    order by t.sort_order, t.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Grants
-- ---------------------------------------------------------------------------
revoke all on function public.events_archive_guard(), public.orders_event_guard()
  from public, anon, authenticated;
revoke all on function public.admin_duplicate_event(uuid), public.admin_reorder_ticket_types(uuid, uuid[]),
  public.admin_update_attendee(uuid, text, text, text), public.admin_events_overview(),
  public.admin_ticket_type_stats(uuid)
  from public, anon;
grant execute on function public.admin_duplicate_event(uuid), public.admin_reorder_ticket_types(uuid, uuid[]),
  public.admin_update_attendee(uuid, text, text, text), public.admin_events_overview(),
  public.admin_ticket_type_stats(uuid)
  to authenticated;
-- get_event_ticket_options was re-created: re-assert its grants.
revoke all on function public.get_event_ticket_options(uuid) from public;
grant execute on function public.get_event_ticket_options(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Direct foreign keys for API embedding (attendee -> order / ticket type).
--    Integrity was already guaranteed by the composite keys; these make the
--    relationships explicit so the admin dashboard can join them via the API.
-- ---------------------------------------------------------------------------
alter table public.attendees
  add constraint attendees_order_fk foreign key (order_id) references public.orders (id) on delete restrict,
  add constraint attendees_ticket_type_fk foreign key (ticket_type_id) references public.ticket_types (id) on delete restrict;
