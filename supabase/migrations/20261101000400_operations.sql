-- PynkPours — 0004 Operations: check-ins, Stripe webhook log, email outbox,
-- append-only audit log.

-- ---------------------------------------------------------------------------
-- Check-in scan history. ticket_id is NULLABLE so unknown QR codes are logged.
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id                    uuid primary key default gen_random_uuid(),
  ticket_id             uuid references public.tickets (id) on delete restrict,
  station_event_id      uuid not null references public.events (id) on delete restrict,
  scanned_by            uuid references auth.users (id) on delete set null,
  scanned_at            timestamptz not null default now(),
  result                public.check_in_result not null,
  method                text not null check (method in ('qr', 'manual')),
  -- First 12 hex chars of the presented credential hash (forensics only).
  presented_hash_prefix text check (presented_hash_prefix is null or presented_hash_prefix ~ '^[0-9a-f]{12}$'),
  voided_at             timestamptz,
  voided_by             uuid references auth.users (id) on delete set null,
  constraint check_ins_accepted_has_ticket check (result <> 'accepted' or ticket_id is not null)
);

-- Defence in depth: at most one live accepted check-in per ticket.
create unique index check_ins_one_accepted_per_ticket
  on public.check_ins (ticket_id) where result = 'accepted' and voided_at is null;
create index check_ins_station_scanned_idx on public.check_ins (station_event_id, scanned_at desc);
create index check_ins_ticket_idx on public.check_ins (ticket_id);

-- ---------------------------------------------------------------------------
-- Stripe webhook idempotency log
-- ---------------------------------------------------------------------------
create table public.stripe_events (
  id            text primary key check (id ~ '^evt_'),
  type          text not null,
  livemode      boolean not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  outcome       text,
  error         text
);

-- ---------------------------------------------------------------------------
-- Transactional email outbox (exactly-once enqueue, retried delivery)
-- ---------------------------------------------------------------------------
create table public.email_messages (
  id                  uuid primary key default gen_random_uuid(),
  -- e.g. 'order_confirmation:<order_id>', 'ticket:<ticket_id>:v1', 'ticket_resend:<ticket_id>:<uuid>'
  dedupe_key          text not null unique,
  kind                text not null check (kind in (
                        'order_confirmation', 'ticket', 'ticket_resend', 'contact_notification')),
  order_id            uuid references public.orders (id) on delete restrict,
  ticket_id           uuid references public.tickets (id) on delete restrict,
  to_email            text not null check (to_email = lower(btrim(to_email))),
  status              public.email_status not null default 'queued',
  attempts            integer not null default 0 check (attempts >= 0),
  next_attempt_at     timestamptz not null default now(),
  locked_until        timestamptz,
  last_error          text,
  provider_message_id text,
  requested_by        uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  updated_at          timestamptz not null default now()
);

create index email_messages_due_idx on public.email_messages (next_attempt_at)
  where status in ('queued', 'failed');
create index email_messages_order_idx on public.email_messages (order_id);
create index email_messages_ticket_idx on public.email_messages (ticket_id);

create trigger email_messages_set_updated_at
  before update on public.email_messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Append-only audit log of administrative actions
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_user_id uuid,          -- null = system (webhook / scheduled job)
  actor_role    text,
  action        text not null check (char_length(action) between 1 and 80),
  entity_type   text not null check (char_length(entity_type) between 1 and 60),
  entity_id     text,
  before_data   jsonb,
  after_data    jsonb,
  metadata      jsonb not null default '{}'::jsonb
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, occurred_at desc);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);

create or replace function public.audit_log_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update before update on public.audit_log
  for each row execute function public.audit_log_block_mutation();
create trigger audit_log_no_delete before delete on public.audit_log
  for each row execute function public.audit_log_block_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_block_mutation();
