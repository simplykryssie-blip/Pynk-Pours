-- PynkPours — 0014 Form builder: owner-built forms (vendor applications, speaker
-- requests, volunteer sign-ups…) with file uploads, review statuses, a private
-- status link for each applicant, and email notifications.
--
--   forms             the form: fields (JSON), linked event, open/closed
--   form_submissions  one per response; reviewed by owners/admins
--   form_files        uploaded files (private Storage bucket "form-uploads")
--
-- Visitors never read submissions. Responses are written by the server (secret
-- key) after validating them against the form's fields.

create table public.forms (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique
                       check (char_length(slug) between 2 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title                text not null check (char_length(btrim(title)) between 1 and 120),
  description          text not null default '' check (char_length(description) <= 5000),
  purpose              text not null default 'general' check (purpose in ('general', 'vendor')),
  event_id             uuid references public.events (id) on delete set null,
  status               text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  closes_at            timestamptz,
  confirmation_message text not null default '' check (char_length(confirmation_message) <= 2000),
  notify_staff         boolean not null default true,
  fields               jsonb not null default '[]'::jsonb
                       check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 40),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id) on delete set null
);

create table public.form_submissions (
  id                uuid primary key default gen_random_uuid(),
  form_id           uuid not null references public.forms (id) on delete restrict,
  data              jsonb not null check (jsonb_typeof(data) = 'object'),
  name              text check (name is null or char_length(name) <= 200),
  email             text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  status            text not null default 'new'
                    check (status in ('new', 'reviewing', 'approved', 'waitlisted', 'declined')),
  status_token_hash text not null unique,
  -- Encrypted copy (app key) so emails can include the private status link; never shown to staff.
  status_token_ciphertext text not null,
  staff_notes       text not null default '' check (char_length(staff_notes) <= 5000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users (id) on delete set null
);
create index form_submissions_form_idx on public.form_submissions (form_id, created_at desc);
create index form_submissions_email_idx on public.form_submissions (email);

create table public.form_files (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions (id) on delete cascade,
  field_key     text not null,
  storage_path  text not null unique,
  filename      text not null check (char_length(filename) between 1 and 200),
  content_type  text not null,
  size_bytes    integer not null check (size_bytes between 1 and 10485760),
  created_at    timestamptz not null default now()
);
create index form_files_submission_idx on public.form_files (submission_id);

-- Status history: each change, with the optional message emailed to the applicant.
create table public.form_status_updates (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.form_submissions (id) on delete cascade,
  status        text not null check (status in ('new', 'reviewing', 'approved', 'waitlisted', 'declined')),
  message       text not null default '' check (char_length(message) <= 5000),
  notify        boolean not null default false,
  created_by    uuid not null references auth.users (id) on delete restrict,
  created_at    timestamptz not null default now()
);
create index form_status_updates_submission_idx on public.form_status_updates (submission_id, created_at);

create trigger forms_set_updated_at before update on public.forms
  for each row execute function public.set_updated_at();
create trigger form_submissions_set_updated_at before update on public.form_submissions
  for each row execute function public.set_updated_at();
create trigger forms_audit after insert or update or delete on public.forms
  for each row execute function public.audit_row_change('id');
create trigger form_submissions_audit after update or delete on public.form_submissions
  for each row execute function public.audit_row_change('id');

alter table public.forms enable row level security;
alter table public.form_submissions enable row level security;
alter table public.form_files enable row level security;
alter table public.form_status_updates enable row level security;

-- Visitors can load open and closed forms (closed ones show "no longer accepting").
grant select on public.forms to anon, authenticated;
create policy forms_public_read on public.forms for select to anon using (status in ('open', 'closed'));
create policy forms_staff_read on public.forms for select to authenticated
  using (status in ('open', 'closed') or (select public.is_admin()));
grant insert (slug, title, description, purpose, event_id, status, closes_at, confirmation_message, notify_staff, fields, updated_by)
  on public.forms to authenticated;
grant update (slug, title, description, purpose, event_id, status, closes_at, confirmation_message, notify_staff, fields, updated_by)
  on public.forms to authenticated;
create policy forms_admin_insert on public.forms for insert to authenticated
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy forms_admin_update on public.forms for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));

-- Submissions and files: owners/admins only. Deleting a response (e.g. a privacy
-- request) is allowed and audited.
grant select on public.form_submissions, public.form_files to authenticated;
grant update (status, staff_notes, reviewed_at, reviewed_by) on public.form_submissions to authenticated;
grant delete on public.form_submissions to authenticated;
create policy form_submissions_admin_read on public.form_submissions for select to authenticated
  using ((select public.is_admin()));
create policy form_submissions_admin_update on public.form_submissions for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and reviewed_by = (select auth.uid()));
create policy form_submissions_admin_delete on public.form_submissions for delete to authenticated
  using ((select public.is_admin()));
create policy form_files_admin_read on public.form_files for select to authenticated
  using ((select public.is_admin()));
grant select on public.form_status_updates to authenticated;
grant insert (submission_id, status, message, notify, created_by) on public.form_status_updates to authenticated;
create policy form_status_updates_admin_read on public.form_status_updates for select to authenticated
  using ((select public.is_admin()));
create policy form_status_updates_admin_insert on public.form_status_updates for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

revoke truncate on public.forms, public.form_submissions, public.form_files, public.form_status_updates from service_role;

-- Form emails go through the same outbox as ticket emails (retries, no duplicates).
alter table public.email_messages drop constraint if exists email_messages_kind_check;
alter table public.email_messages add constraint email_messages_kind_check check (kind in (
  'order_confirmation', 'ticket', 'ticket_resend', 'contact_notification',
  'form_receipt', 'form_notification', 'form_status'));

-- Private bucket for uploaded files (10 MB each). Visitors upload only through
-- one-time signed upload links issued by the server; nobody can list or read
-- the files except the server, which gives staff short-lived download links.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('form-uploads', 'form-uploads', false, 10485760,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
    on conflict (id) do update
      set public = excluded.public, file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  else
    raise notice 'storage schema not present; skipping bucket setup';
  end if;
end;
$$;

-- CSV export of a form's responses. Audited, like the other exports.
create or replace function public.export_form_responses(p_form_id uuid)
returns table (id uuid, created_at timestamptz, status text, name text, email text, data jsonb, staff_notes text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.write_audit('export.form_responses', 'forms', p_form_id::text);
  return query
    select s.id, s.created_at, s.status, s.name, s.email, s.data, s.staff_notes
    from public.form_submissions s where s.form_id = p_form_id order by s.created_at;
end;
$$;
revoke all on function public.export_form_responses(uuid) from public, anon;
grant execute on function public.export_form_responses(uuid) to authenticated;


-- People list: include form responses (counted with messages) and show them in each person's history.
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
  union all
  -- Form responses (vendor applications etc.) count as getting in touch.
  select s.email, s.name, null, s.created_at, 'inquiry', f.event_id, false, false
  from public.form_submissions s join public.forms f on f.id = s.form_id
$$;
revoke all on function public.people_touchpoints() from public, anon, authenticated;

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
      select s.created_at, 'form', f.title, f.event_id, 'Status: ' || s.status, s.id::text
      from public.form_submissions s join public.forms f on f.id = s.form_id where s.email = v_email
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
revoke all on function public.admin_person(text) from public, anon;
grant execute on function public.admin_person(text) to authenticated;
