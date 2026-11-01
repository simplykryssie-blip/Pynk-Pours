-- PynkPours — 0011 Custom pages (owner-created policies such as a Code of
-- Conduct or Photo Policy), shown at /policies/<slug>.
--
-- Owners and admins create, edit, publish/hide and delete them from the
-- dashboard (Policies). The public can read only published pages. Each page can
-- be listed in the site footer. Every change is written to the audit log.

create table public.custom_pages (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                 check (char_length(slug) between 2 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title          text not null check (char_length(btrim(title)) between 1 and 120),
  body           text not null check (char_length(btrim(body)) between 1 and 60000),
  published      boolean not null default false,
  show_in_footer boolean not null default false,
  footer_position integer not null default 100 check (footer_position between 0 and 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null
);

create trigger custom_pages_set_updated_at
  before update on public.custom_pages
  for each row execute function public.set_updated_at();

create trigger custom_pages_audit after insert or update or delete on public.custom_pages
  for each row execute function public.audit_row_change('id');

alter table public.custom_pages enable row level security;

grant select on public.custom_pages to anon, authenticated;
-- Visitors see published pages only; owners/admins (MFA-verified) see drafts too.
create policy custom_pages_public_read on public.custom_pages
  for select to anon
  using (published);
create policy custom_pages_staff_read on public.custom_pages
  for select to authenticated
  using (published or (select public.is_admin()));

grant insert (slug, title, body, published, show_in_footer, footer_position, updated_by) on public.custom_pages to authenticated;
grant update (slug, title, body, published, show_in_footer, footer_position, updated_by) on public.custom_pages to authenticated;
grant delete on public.custom_pages to authenticated;

create policy custom_pages_admin_insert on public.custom_pages
  for insert to authenticated
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy custom_pages_admin_update on public.custom_pages
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy custom_pages_admin_delete on public.custom_pages
  for delete to authenticated
  using ((select public.is_admin()));
