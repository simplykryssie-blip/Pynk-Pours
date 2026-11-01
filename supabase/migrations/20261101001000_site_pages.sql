-- PynkPours — 0010 Editable site pages (Privacy, Terms, Refund policy).
--
-- Owners and admins edit these from the dashboard (Policies). The public site
-- reads them; until a row exists, the site shows the built-in default text.
-- Every change is written to the append-only audit log.

create table public.site_pages (
  slug       text primary key check (slug in ('privacy', 'terms', 'refunds')),
  title      text not null check (char_length(btrim(title)) between 1 and 120),
  body       text not null check (char_length(btrim(body)) between 1 and 60000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger site_pages_set_updated_at
  before update on public.site_pages
  for each row execute function public.set_updated_at();

create trigger site_pages_audit after insert or update or delete on public.site_pages
  for each row execute function public.audit_row_change('slug');

alter table public.site_pages enable row level security;

-- Everyone may read the published policies.
grant select on public.site_pages to anon, authenticated;
create policy site_pages_public_read on public.site_pages
  for select to anon, authenticated using (true);

-- Owners/admins (MFA-verified, via is_admin()) may create and edit them. No deletes.
grant insert (slug, title, body, updated_by) on public.site_pages to authenticated;
grant update (title, body, updated_by) on public.site_pages to authenticated;
create policy site_pages_admin_insert on public.site_pages
  for insert to authenticated
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy site_pages_admin_update on public.site_pages
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
