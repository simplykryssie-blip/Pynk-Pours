-- PynkPours — 0006 Security: role helpers, audit triggers, privileges, RLS.
--
-- Supabase's default privileges grant broad table/function access to the
-- `anon` and `authenticated` roles. We revoke EVERYTHING and grant back only
-- what each role needs. RLS is then a second, independent layer.

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they can read admin_profiles under RLS)
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
  where ap.user_id = (select auth.uid()) and ap.is_active;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_staff_role() is not null;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() in ('owner', 'admin'), false);
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role() = 'owner', false);
$$;

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
-- Internal writer used by RPCs and triggers. Not granted to any API role.
create or replace function public.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_metadata    jsonb default '{}'::jsonb,
  p_actor       uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(
    p_actor,
    (select auth.uid()),
    nullif(current_setting('pynkpours.actor_id', true), '')::uuid
  );
begin
  insert into public.audit_log (actor_user_id, actor_role, action, entity_type, entity_id,
                                before_data, after_data, metadata)
  values (
    v_actor,
    (select ap.role::text from public.admin_profiles ap where ap.user_id = v_actor),
    p_action, p_entity_type, p_entity_id, p_before, p_after, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  v_id := case when tg_op = 'DELETE' then (to_jsonb(old) ->> tg_argv[0])
               else (to_jsonb(new) ->> tg_argv[0]) end;
  perform public.write_audit(
    lower(tg_op),
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger events_audit after insert or update or delete on public.events
  for each row execute function public.audit_row_change('id');
create trigger ticket_types_audit after insert or update or delete on public.ticket_types
  for each row execute function public.audit_row_change('id');
create trigger event_questions_audit after insert or update or delete on public.event_questions
  for each row execute function public.audit_row_change('id');
create trigger admin_profiles_audit after insert or update or delete on public.admin_profiles
  for each row execute function public.audit_row_change('user_id');

-- ---------------------------------------------------------------------------
-- Privileges: revoke everything, then grant explicitly.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- Future objects created by the migration owner do not get implicit grants.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- The server (secret key / service_role) never needs TRUNCATE, and must not be
-- able to rewrite history.
revoke truncate on all tables in schema public from service_role;
revoke update, delete on public.audit_log from service_role;

-- Public content. Anonymous visitors get public columns only — never capacity
-- or admissions_sold (those reveal sales numbers). Staff see all columns.
grant select (id, slug, title, short_description, description, category_label, cover_image_path,
              cover_image_alt, starts_at, ends_at, timezone, is_online, venue_name, venue_address,
              venue_notes, dress_code, parking_info, accessibility_info, refund_policy, min_age,
              agenda, speakers, faqs, currency, max_tickets_per_order, show_remaining_count,
              registration_mode, sold_out_behavior, status, is_featured, published_at,
              cancelled_at, created_at, updated_at)
  on public.events to anon;
grant select on public.events to authenticated;
grant select on public.event_questions to anon, authenticated;

-- Admin-managed content (RLS restricts to admins). Column lists deliberately
-- exclude server-maintained columns (quantity_sold, published_at, cancelled_at...).
grant insert (slug, title, short_description, description, category_label, cover_image_path,
              cover_image_alt, starts_at, ends_at, timezone, is_online, venue_name, venue_address,
              venue_notes, dress_code, parking_info, accessibility_info, refund_policy, min_age,
              agenda, speakers, faqs, currency, capacity, max_tickets_per_order,
              show_remaining_count, registration_mode, sold_out_behavior, is_featured)
  on public.events to authenticated;
grant update (slug, title, short_description, description, category_label, cover_image_path,
              cover_image_alt, starts_at, ends_at, timezone, is_online, venue_name, venue_address,
              venue_notes, dress_code, parking_info, accessibility_info, refund_policy, min_age,
              agenda, speakers, faqs, currency, capacity, max_tickets_per_order,
              show_remaining_count, registration_mode, sold_out_behavior, is_featured, status)
  on public.events to authenticated;
grant delete on public.events to authenticated;

grant select on public.ticket_types to authenticated;
grant insert (event_id, name, description, inclusions, price_cents, admits_per_unit, capacity,
              max_per_order, sales_start_at, sales_end_at, sort_order, status)
  on public.ticket_types to authenticated;
grant update (name, description, inclusions, price_cents, admits_per_unit, capacity,
              max_per_order, sales_start_at, sales_end_at, sort_order, status)
  on public.ticket_types to authenticated;
grant delete on public.ticket_types to authenticated;

grant insert (event_id, label, help_text, kind, options, is_required, sort_order)
  on public.event_questions to authenticated;
grant update (label, help_text, kind, options, is_required, sort_order)
  on public.event_questions to authenticated;
grant delete on public.event_questions to authenticated;

-- Private data: read-only for admins via RLS. All writes go through RPCs.
grant select on public.orders, public.order_items, public.attendees, public.tickets,
                public.check_ins, public.refunds, public.inventory_holds,
                public.email_messages, public.audit_log, public.admin_profiles,
                public.contact_submissions, public.newsletter_subscribers, public.event_interest
  to authenticated;
grant update (status, handled_at) on public.contact_submissions to authenticated;
grant update (status) on public.event_interest to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.admin_profiles         enable row level security;
alter table public.events                 enable row level security;
alter table public.ticket_types           enable row level security;
alter table public.event_questions        enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.attendees              enable row level security;
alter table public.inventory_holds        enable row level security;
alter table public.tickets                enable row level security;
alter table public.refunds                enable row level security;
alter table public.check_ins              enable row level security;
alter table public.stripe_events          enable row level security;
alter table public.email_messages         enable row level security;
alter table public.audit_log              enable row level security;
alter table public.contact_submissions    enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.event_interest         enable row level security;
alter table public.rate_limits            enable row level security;

-- Events: anyone can read events that are visible (ever published, not draft).
create policy events_public_read on public.events
  for select to anon, authenticated
  using (status <> 'draft' and published_at is not null);
create policy events_admin_read on public.events
  for select to authenticated using ((select public.is_admin()));
create policy events_admin_insert on public.events
  for insert to authenticated with check ((select public.is_admin()));
create policy events_admin_update on public.events
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Only never-published drafts may be deleted (FKs also block if any orders exist).
create policy events_admin_delete on public.events
  for delete to authenticated
  using ((select public.is_admin()) and status = 'draft' and published_at is null);

-- Ticket types: no direct public read. Public uses get_event_ticket_options().
create policy ticket_types_admin_all on public.ticket_types
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Event questions: public can read questions for visible events (shown at checkout).
create policy event_questions_public_read on public.event_questions
  for select to anon, authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_id and e.status <> 'draft' and e.published_at is not null));
create policy event_questions_admin_all on public.event_questions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Private commerce + ops: admins (owner/admin) read only. Check-in staff use RPCs.
create policy orders_admin_read on public.orders
  for select to authenticated using ((select public.is_admin()));
create policy order_items_admin_read on public.order_items
  for select to authenticated using ((select public.is_admin()));
create policy attendees_admin_read on public.attendees
  for select to authenticated using ((select public.is_admin()));
create policy inventory_holds_admin_read on public.inventory_holds
  for select to authenticated using ((select public.is_admin()));
create policy tickets_admin_read on public.tickets
  for select to authenticated using ((select public.is_admin()));
create policy refunds_admin_read on public.refunds
  for select to authenticated using ((select public.is_admin()));
create policy check_ins_admin_read on public.check_ins
  for select to authenticated using ((select public.is_admin()));
create policy email_messages_admin_read on public.email_messages
  for select to authenticated using ((select public.is_admin()));
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using ((select public.is_admin()));

create policy contact_admin_read on public.contact_submissions
  for select to authenticated using ((select public.is_admin()));
create policy contact_admin_update on public.contact_submissions
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy newsletter_admin_read on public.newsletter_subscribers
  for select to authenticated using ((select public.is_admin()));
create policy event_interest_admin_read on public.event_interest
  for select to authenticated using ((select public.is_admin()));
create policy event_interest_admin_update on public.event_interest
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Staff profiles: each staff member sees their own row; the owner sees all.
create policy admin_profiles_self_read on public.admin_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy admin_profiles_owner_read on public.admin_profiles
  for select to authenticated using ((select public.is_owner()));

-- stripe_events and rate_limits: no policies => no API access except service_role.
