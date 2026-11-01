-- PynkPours — 0013 People: one combined list of everyone who has interacted
-- with PynkPours (bought or registered, attended, joined a waitlist or
-- get-notified list, sent a message, or subscribed), one row per email.
--
-- The list is computed from the existing records, so it is always current.
-- Staff notes and tags live in people_notes. Marketing permission comes from
-- newsletter_subscribers (consented, or unsubscribed); nobody else may receive
-- bulk marketing. Owners/admins only (check-in staff never see it).

create table public.people_notes (
  email      text primary key check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  notes      text not null default '' check (char_length(notes) <= 5000),
  tags       text[] not null default '{}'
             check (cardinality(tags) <= 20 and char_length(array_to_string(tags, ',')) <= 600),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger people_notes_set_updated_at before update on public.people_notes
  for each row execute function public.set_updated_at();
create trigger people_notes_audit after insert or update or delete on public.people_notes
  for each row execute function public.audit_row_change('email');

alter table public.people_notes enable row level security;
grant select on public.people_notes to authenticated;
grant insert (email, notes, tags, updated_by) on public.people_notes to authenticated;
grant update (notes, tags, updated_by) on public.people_notes to authenticated;
create policy people_notes_admin_read on public.people_notes
  for select to authenticated using ((select public.is_admin()));
create policy people_notes_admin_insert on public.people_notes
  for insert to authenticated
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy people_notes_admin_update on public.people_notes
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Every interaction, one row each. Internal: called only by the functions below.
create or replace function public.people_touchpoints()
returns table (email text, name text, phone text, at timestamptz, kind text, event_id uuid, attended boolean, event_ended boolean)
language sql
stable
security definer
set search_path = ''
as $$
  -- Buyers of completed orders (paid, or later refunded: they still bought).
  select lower(btrim(o.purchaser_email)), o.purchaser_name, nullif(o.purchaser_phone, ''), coalesce(o.paid_at, o.created_at),
         'purchase', o.event_id, false, coalesce(e.ends_at, e.starts_at) < now()
  from public.orders o join public.events e on e.id = o.event_id
  where o.status in ('paid', 'partially_refunded', 'refunded')
  union all
  -- Guests named on tickets.
  select lower(btrim(a.email)), a.full_name, nullif(a.phone, ''), t.issued_at,
         'ticket', t.event_id, t.checked_in_at is not null, coalesce(e.ends_at, e.starts_at) < now()
  from public.tickets t join public.attendees a on a.id = t.attendee_id join public.events e on e.id = t.event_id
  union all
  select lower(btrim(i.email)), nullif(i.name, ''), null, i.created_at, 'interest', i.event_id, false, false
  from public.event_interest i
  union all
  select lower(btrim(c.email)), c.name, null, c.created_at, 'inquiry', null, false, false
  from public.contact_submissions c where c.status <> 'spam'
  union all
  select lower(btrim(n.email)), null, null, n.created_at, 'newsletter', null, false, false
  from public.newsletter_subscribers n
$$;
revoke all on function public.people_touchpoints() from public, anon, authenticated;

create or replace function public.people_summary()
returns table (
  email text, name text, phone text, first_seen timestamptz, last_seen timestamptz,
  events_registered integer, events_attended integer, events_missed integer,
  inquiries integer, interest integer, marketing text, tags text[], notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  with tp as (select * from public.people_touchpoints() where email is not null and email <> ''),
  agg as (
    select tp.email,
      (array_agg(tp.name order by tp.at desc) filter (where tp.name is not null))[1] as name,
      (array_agg(tp.phone order by tp.at desc) filter (where tp.phone is not null))[1] as phone,
      min(tp.at) as first_seen, max(tp.at) as last_seen,
      count(distinct tp.event_id) filter (where tp.kind in ('purchase', 'ticket'))::int as events_registered,
      count(distinct tp.event_id) filter (where tp.kind = 'ticket' and tp.attended)::int as events_attended,
      count(*) filter (where tp.kind = 'inquiry')::int as inquiries,
      count(*) filter (where tp.kind = 'interest')::int as interest
    from tp group by tp.email
  ),
  -- Past events someone held a ticket for but never checked in to.
  missed as (
    select r.email, count(distinct r.event_id)::int as n
    from tp r
    where r.kind = 'ticket' and r.event_ended
      and not exists (select 1 from tp x where x.email = r.email and x.event_id = r.event_id and x.kind = 'ticket' and x.attended)
    group by r.email
  )
  select a.email, a.name, a.phone, a.first_seen, a.last_seen, a.events_registered, a.events_attended,
         coalesce(m.n, 0), a.inquiries, a.interest,
         case when n.unsubscribed_at is not null then 'unsubscribed' when n.id is not null then 'yes' else 'no' end,
         coalesce(pn.tags, '{}'), coalesce(pn.notes, '')
  from agg a
  left join missed m on m.email = a.email
  left join public.newsletter_subscribers n on lower(btrim(n.email)) = a.email
  left join public.people_notes pn on pn.email = a.email
$$;
revoke all on function public.people_summary() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Segments: all | attended | missed (registered for a past event, never checked in)
--           | registered | inquired | interested | subscribed | not_subscribed
create or replace function public.people_filtered(p_search text, p_segment text, p_tag text)
returns setof record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_tag text := nullif(lower(btrim(coalesce(p_tag, ''))), '');
  v_seg text := coalesce(p_segment, 'all');
begin
  if v_seg not in ('all', 'attended', 'missed', 'registered', 'inquired', 'interested', 'subscribed', 'not_subscribed') then
    raise exception 'invalid_request';
  end if;
  return query
    select s.email, s.name, s.phone, s.first_seen, s.last_seen, s.events_registered, s.events_attended, s.events_missed,
           s.inquiries, s.interest, s.marketing, s.tags
    from public.people_summary() s
    where (v_q is null or strpos(s.email, lower(v_q)) > 0 or strpos(lower(coalesce(s.name, '')), lower(v_q)) > 0)
      and (v_tag is null or v_tag = any (s.tags))
      and case v_seg
            when 'attended' then s.events_attended > 0
            when 'missed' then s.events_missed > 0
            when 'registered' then s.events_registered > 0
            when 'inquired' then s.inquiries > 0
            when 'interested' then s.interest > 0
            when 'subscribed' then s.marketing = 'yes'
            when 'not_subscribed' then s.marketing <> 'yes'
            else true end;
end;
$$;
revoke all on function public.people_filtered(text, text, text) from public, anon, authenticated;

create or replace function public.admin_people(
  p_search text default null, p_segment text default 'all', p_tag text default null,
  p_limit integer default 50, p_offset integer default 0
)
returns table (
  email text, name text, phone text, first_seen timestamptz, last_seen timestamptz,
  events_registered integer, events_attended integer, events_missed integer,
  inquiries integer, interest integer, marketing text, tags text[], total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select f.*, count(*) over ()
    from public.people_filtered(p_search, p_segment, p_tag) as f(
      email text, name text, phone text, first_seen timestamptz, last_seen timestamptz,
      events_registered integer, events_attended integer, events_missed integer,
      inquiries integer, interest integer, marketing text, tags text[])
    order by f.last_seen desc, f.email
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- One person: summary, notes/tags and a timeline of every interaction.
create or replace function public.admin_person(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_summary jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(s) into v_summary from public.people_summary() s where s.email = v_email;
  if v_summary is null then return null; end if;
  return v_summary || jsonb_build_object('timeline', coalesce((
    select jsonb_agg(t order by t.at desc) from (
      select o.created_at as at, 'order' as kind, e.title as event_title, e.id as event_id,
             'Order #' || o.order_number || ' · ' || o.status::text as detail, o.id::text as ref
      from public.orders o join public.events e on e.id = o.event_id
      where lower(btrim(o.purchaser_email)) = v_email and o.status in ('paid', 'partially_refunded', 'refunded')
      union all
      select t.issued_at, case when t.checked_in_at is not null then 'attended' else 'ticket' end, e.title, e.id,
             tt.name || case when t.status <> 'valid' then ' · ' || t.status::text else '' end
               || case when t.checked_in_at is not null then ' · checked in' else '' end, t.id::text
      from public.tickets t join public.attendees a on a.id = t.attendee_id
      join public.events e on e.id = t.event_id join public.ticket_types tt on tt.id = t.ticket_type_id
      where lower(btrim(a.email)) = v_email
      union all
      select i.created_at, 'interest', e.title, e.id, case i.kind when 'waitlist' then 'Joined the waitlist' else 'Asked to be notified' end, i.id::text
      from public.event_interest i join public.events e on e.id = i.event_id
      where lower(btrim(i.email)) = v_email
      union all
      select c.created_at, 'inquiry', null, null, coalesce(nullif(c.subject, ''), left(c.message, 140)), c.id::text
      from public.contact_submissions c where lower(btrim(c.email)) = v_email and c.status <> 'spam'
      union all
      select n.consented_at, 'subscribed', null, null, 'Agreed to marketing emails' || coalesce(' (' || n.source || ')', ''), n.id::text
      from public.newsletter_subscribers n where lower(btrim(n.email)) = v_email
      union all
      select n.unsubscribed_at, 'unsubscribed', null, null, 'Unsubscribed from marketing emails', n.id::text
      from public.newsletter_subscribers n where lower(btrim(n.email)) = v_email and n.unsubscribed_at is not null
    ) t
  ), '[]'::jsonb));
end;
$$;

-- CSV export of a filtered list. Audited, like the other exports.
create or replace function public.export_people(p_search text default null, p_segment text default 'all', p_tag text default null)
returns table (
  email text, name text, phone text, first_seen timestamptz, last_seen timestamptz,
  events_registered integer, events_attended integer, events_missed integer,
  inquiries integer, interest integer, marketing text, tags text[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.write_audit('export.people', 'people', coalesce(p_segment, 'all'),
    null, jsonb_build_object('segment', p_segment, 'tag', p_tag, 'search', p_search));
  return query
    select f.*
    from public.people_filtered(p_search, p_segment, p_tag) as f(
      email text, name text, phone text, first_seen timestamptz, last_seen timestamptz,
      events_registered integer, events_attended integer, events_missed integer,
      inquiries integer, interest integer, marketing text, tags text[])
    order by f.last_seen desc, f.email;
end;
$$;

revoke all on function public.admin_people(text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_person(text) from public, anon;
revoke all on function public.export_people(text, text, text) from public, anon;
grant execute on function public.admin_people(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_person(text) to authenticated;
grant execute on function public.export_people(text, text, text) to authenticated;
