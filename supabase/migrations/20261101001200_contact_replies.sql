-- PynkPours — 0012 Replies to contact-form messages, sent from the dashboard Inbox.
--
-- The reply is emailed to the sender (from EMAIL_FROM, reply-to the PynkPours
-- inbox) and kept here so the conversation is visible on the message.
-- Replies are a record of what was sent: they can't be edited or deleted.

create table public.contact_replies (
  id                  uuid primary key default gen_random_uuid(),
  submission_id       uuid not null references public.contact_submissions (id) on delete restrict,
  body                text not null check (char_length(btrim(body)) between 1 and 10000),
  sent_by             uuid not null references auth.users (id) on delete restrict,
  provider_message_id text,
  created_at          timestamptz not null default now()
);

create index contact_replies_submission_idx on public.contact_replies (submission_id, created_at);

create trigger contact_replies_audit after insert or update or delete on public.contact_replies
  for each row execute function public.audit_row_change('submission_id');

alter table public.contact_replies enable row level security;

grant select on public.contact_replies to authenticated;
grant insert (submission_id, body, sent_by, provider_message_id) on public.contact_replies to authenticated;

create policy contact_replies_admin_read on public.contact_replies
  for select to authenticated
  using ((select public.is_admin()));
create policy contact_replies_admin_insert on public.contact_replies
  for insert to authenticated
  with check ((select public.is_admin()) and sent_by = (select auth.uid()));
