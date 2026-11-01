-- PynkPours — 0001 Foundation: extensions, enum types, shared helpers.
--
-- Replaces the draft docs/reference/ORIGINAL_DRAFT_20261031000100_initial_pynkpours_schema.sql.
-- Target: a NEW, dedicated PynkPours Supabase project. Do not apply to production
-- without owner approval.
--
-- Conventions used throughout these migrations:
--   * Every function uses `set search_path = ''` and fully-qualified names.
--   * Commerce records are never hard-deleted; foreign keys use RESTRICT.
--   * Privileges are revoked wholesale and re-granted explicitly in 0006.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type public.event_status as enum ('draft', 'published', 'cancelled', 'completed');
create type public.registration_mode as enum ('tickets', 'coming_soon', 'closed');
create type public.sold_out_behavior as enum ('sold_out', 'waitlist');

-- "sold_out" is intentionally NOT a stored status: it is derived from inventory.
create type public.ticket_sale_status as enum ('active', 'paused', 'closed');

create type public.order_status as enum (
  'pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'
);

-- Ticket validity is separate from attendance (checked_in_at).
create type public.ticket_validity as enum ('valid', 'cancelled', 'refunded');

create type public.hold_status as enum ('active', 'converted', 'released', 'expired');

create type public.check_in_result as enum (
  'accepted', 'already_checked_in', 'invalid', 'wrong_event', 'refunded', 'cancelled'
);

create type public.staff_role as enum ('owner', 'admin', 'checkin');

create type public.email_status as enum ('queued', 'sending', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalise email-like text: trim + lowercase. Used by triggers on inbound data.
create or replace function public.normalize_email(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(p)), '');
$$;
