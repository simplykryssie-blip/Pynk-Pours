-- PynkPours — 0007 Trusted operations (RPCs).
--
-- Locking discipline (prevents deadlocks and overselling):
--   Every operation that changes inventory locks the EVENT row first
--   (SELECT ... FOR UPDATE), then the ORDER row. Reservations for one event are
--   therefore serialised; different events never block each other.
--
-- Errors raised for expected business conditions use SQLSTATE 'P0001' with a
-- machine-readable MESSAGE (e.g. 'sold_out') and a human DETAIL.
--
-- Grants are at the bottom of this file.

-- ===========================================================================
-- Availability helpers (internal)
-- ===========================================================================

-- Units still purchasable for a ticket type, ignoring holds belonging to
-- p_exclude_order. NULL = unlimited at the tier level.
create or replace function public._ticket_type_remaining_units(
  p_ticket_type_id uuid,
  p_exclude_order  uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when t.capacity is null then null
              else t.capacity - t.quantity_sold - coalesce((
                select sum(h.quantity)::integer from public.inventory_holds h
                where h.ticket_type_id = t.id and h.status = 'active' and h.expires_at > now()
                  and (p_exclude_order is null or h.order_id <> p_exclude_order)), 0)
         end
  from public.ticket_types t
  where t.id = p_ticket_type_id;
$$;

-- Admissions still available at the event level. NULL = no event-level cap.
create or replace function public._event_remaining_admissions(
  p_event_id      uuid,
  p_exclude_order uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when e.capacity is null then null
              else e.capacity - e.admissions_sold - coalesce((
                select sum(h.admissions)::integer from public.inventory_holds h
                where h.event_id = e.id and h.status = 'active' and h.expires_at > now()
                  and (p_exclude_order is null or h.order_id <> p_exclude_order)), 0)
         end
  from public.events e
  where e.id = p_event_id;
$$;

-- When do sales for this tier end? Explicit end, else event end, else event start.
create or replace function public._sales_end(p_type public.ticket_types, p_event public.events)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(p_type.sales_end_at, p_event.ends_at, p_event.starts_at);
$$;

-- ===========================================================================
-- PUBLIC: ticket options for an event page (anon-callable)
-- ===========================================================================
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
  display_state    text,      -- on_sale | scheduled | ended | paused | closed | sold_out | coming_soon
  remaining        integer,   -- only when the event opts in AND tier is on sale
  max_purchasable  integer    -- 0 unless on_sale
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
begin
  select * into e from public.events ev
  where ev.id = p_event_id and ev.status <> 'draft' and ev.published_at is not null;
  if not found then
    return;
  end if;

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

    v_state := case
      when e.status <> 'published' then 'closed'
      when e.registration_mode = 'coming_soon' then 'coming_soon'
      when e.registration_mode = 'closed' then 'closed'
      when t.status = 'paused' then 'paused'
      when t.status = 'closed' then 'closed'
      when t.sales_start_at is not null and v_now < t.sales_start_at then 'scheduled'
      when public._sales_end(t, e) is not null and v_now >= public._sales_end(t, e) then 'ended'
      when v_left <= 0 then 'sold_out'
      else 'on_sale'
    end;

    id := t.id; name := t.name; description := t.description; inclusions := t.inclusions;
    price_cents := t.price_cents; currency := e.currency; admits_per_unit := t.admits_per_unit;
    sort_order := t.sort_order; sales_start_at := t.sales_start_at; sales_end_at := t.sales_end_at;
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

-- ===========================================================================
-- SERVER: create a pending order + inventory holds atomically
-- ===========================================================================
-- p_payload:
-- {
--   "event_id": uuid, "idempotency_key": text, "public_token_hash": hex64,
--   "hold_minutes": int (10..60, default 35),
--   "purchaser": { "name", "email", "phone" },
--   "items":     [ { "ticket_type_id", "quantity" } ],
--   "attendees": [ { "ticket_type_id", "full_name", "email", "phone", "answers": {} } ]
-- }
create or replace function public.create_pending_order(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id   uuid := (p_payload ->> 'event_id')::uuid;
  v_key        text := p_payload ->> 'idempotency_key';
  v_hold_min   integer := coalesce((p_payload ->> 'hold_minutes')::integer, 35);
  v_existing   public.orders;
  e            public.events;
  t            public.ticket_types;
  v_item       jsonb;
  v_att        jsonb;
  v_qty        integer;
  v_left       integer;
  v_event_left integer;
  v_total_adm  integer := 0;
  v_subtotal   integer := 0;
  v_order_id   uuid;
  v_order_no   bigint;
  v_expires    timestamptz;
  v_item_id    uuid;
  v_pos        integer := 0;
  v_needed     integer;
  v_given      integer;
  v_q          record;
  v_lines      jsonb := '[]'::jsonb;
begin
  if v_key is null then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'idempotency_key required';
  end if;

  -- Idempotent replay: same form submission returns the same order.
  select * into v_existing from public.orders o where o.checkout_idempotency_key = v_key;
  if found then
    return jsonb_build_object(
      'order_id', v_existing.id, 'order_number', v_existing.order_number,
      'status', v_existing.status, 'total_cents', v_existing.total_cents,
      'currency', v_existing.currency, 'expires_at', v_existing.expires_at,
      'existing', true,
      'line_items', (select coalesce(jsonb_agg(jsonb_build_object(
                        'ticket_type_id', oi.ticket_type_id, 'name', oi.ticket_type_name,
                        'unit_price_cents', oi.unit_price_cents, 'quantity', oi.quantity)
                        order by oi.created_at), '[]'::jsonb)
                     from public.order_items oi where oi.order_id = v_existing.id));
  end if;

  if v_hold_min < 10 or v_hold_min > 60 then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'hold_minutes out of range';
  end if;
  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'at least one item required';
  end if;
  if jsonb_typeof(p_payload -> 'attendees') <> 'array' then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'attendees array required';
  end if;
  if (select count(*) from jsonb_array_elements(p_payload -> 'items'))
     <> (select count(distinct x ->> 'ticket_type_id') from jsonb_array_elements(p_payload -> 'items') x) then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'duplicate ticket type';
  end if;

  -- Serialise all inventory changes for this event.
  select * into e from public.events ev where ev.id = v_event_id for update;
  if not found or e.status <> 'published' or e.published_at is null then
    raise exception 'event_unavailable' using errcode = 'P0001', detail = 'Event is not on sale';
  end if;
  if e.registration_mode <> 'tickets' then
    raise exception 'registration_not_open' using errcode = 'P0001', detail = e.registration_mode::text;
  end if;

  v_event_left := public._event_remaining_admissions(e.id);

  -- Validate every item before writing anything.
  for v_item in select * from jsonb_array_elements(p_payload -> 'items') loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'invalid_quantity' using errcode = 'P0001';
    end if;
    select * into t from public.ticket_types tt
      where tt.id = (v_item ->> 'ticket_type_id')::uuid and tt.event_id = e.id;
    if not found then
      raise exception 'ticket_type_not_found' using errcode = 'P0001';
    end if;
    if t.status <> 'active'
       or (t.sales_start_at is not null and now() < t.sales_start_at)
       or (public._sales_end(t, e) is not null and now() >= public._sales_end(t, e)) then
      raise exception 'ticket_type_not_on_sale' using errcode = 'P0001', detail = t.id::text;
    end if;
    if t.max_per_order is not null and v_qty > t.max_per_order then
      raise exception 'exceeds_max_per_order' using errcode = 'P0001', detail = t.id::text;
    end if;
    v_left := public._ticket_type_remaining_units(t.id);
    if v_left is not null and v_qty > v_left then
      raise exception 'sold_out' using errcode = 'P0001', detail = t.id::text;
    end if;
    v_total_adm := v_total_adm + v_qty * t.admits_per_unit;
    v_subtotal := v_subtotal + v_qty * t.price_cents;

    v_given := (select count(*) from jsonb_array_elements(p_payload -> 'attendees') a
                where (a ->> 'ticket_type_id')::uuid = t.id);
    v_needed := v_qty * t.admits_per_unit;
    if v_given <> v_needed then
      raise exception 'attendee_count_mismatch' using errcode = 'P0001',
        detail = format('%s attendees required for %s', v_needed, t.id);
    end if;
  end loop;

  if jsonb_array_length(p_payload -> 'attendees') <> v_total_adm then
    raise exception 'attendee_count_mismatch' using errcode = 'P0001';
  end if;
  if v_total_adm > e.max_tickets_per_order then
    raise exception 'exceeds_max_per_order' using errcode = 'P0001', detail = 'event limit';
  end if;
  if v_event_left is not null and v_total_adm > v_event_left then
    raise exception 'sold_out' using errcode = 'P0001', detail = 'event capacity';
  end if;

  -- Required questions must be answered for every attendee; unknown keys rejected.
  for v_att in select * from jsonb_array_elements(p_payload -> 'attendees') loop
    if jsonb_typeof(coalesce(v_att -> 'answers', '{}'::jsonb)) <> 'object' then
      raise exception 'invalid_answers' using errcode = 'P0001';
    end if;
    for v_q in select q.id, q.is_required from public.event_questions q where q.event_id = e.id loop
      if v_q.is_required and coalesce(btrim(v_att -> 'answers' ->> v_q.id::text), '') = '' then
        raise exception 'missing_required_answer' using errcode = 'P0001', detail = v_q.id::text;
      end if;
    end loop;
    if exists (
      select 1 from jsonb_object_keys(coalesce(v_att -> 'answers', '{}'::jsonb)) k
      where not exists (select 1 from public.event_questions q
                        where q.event_id = e.id and q.id::text = k)) then
      raise exception 'invalid_answers' using errcode = 'P0001', detail = 'unknown question';
    end if;
  end loop;

  v_expires := now() + make_interval(mins => v_hold_min);

  insert into public.orders (event_id, purchaser_name, purchaser_email, purchaser_phone, currency,
                             subtotal_cents, discount_cents, fee_cents, total_cents,
                             checkout_idempotency_key, public_token_hash, expires_at,
                             payment_provider)
  values (e.id,
          btrim(p_payload -> 'purchaser' ->> 'name'),
          lower(btrim(p_payload -> 'purchaser' ->> 'email')),
          nullif(btrim(p_payload -> 'purchaser' ->> 'phone'), ''),
          e.currency, v_subtotal, 0, 0, v_subtotal,
          v_key, p_payload ->> 'public_token_hash', v_expires,
          case when v_subtotal = 0 then 'free' else 'stripe' end)
  returning id, order_number into v_order_id, v_order_no;

  for v_item in select * from jsonb_array_elements(p_payload -> 'items') loop
    v_qty := (v_item ->> 'quantity')::integer;
    select * into t from public.ticket_types tt where tt.id = (v_item ->> 'ticket_type_id')::uuid;

    insert into public.order_items (order_id, event_id, ticket_type_id, ticket_type_name,
                                    unit_price_cents, quantity, admits_per_unit, line_total_cents)
    values (v_order_id, e.id, t.id, t.name, t.price_cents, v_qty, t.admits_per_unit,
            t.price_cents * v_qty)
    returning id into v_item_id;

    insert into public.inventory_holds (order_id, event_id, ticket_type_id, quantity, admissions, expires_at)
    values (v_order_id, e.id, t.id, v_qty, v_qty * t.admits_per_unit, v_expires);

    for v_att in
      select a from jsonb_array_elements(p_payload -> 'attendees') a
      where (a ->> 'ticket_type_id')::uuid = t.id
    loop
      v_pos := v_pos + 1;
      insert into public.attendees (order_item_id, order_id, event_id, ticket_type_id, position,
                                    full_name, email, phone, answers)
      values (v_item_id, v_order_id, e.id, t.id, v_pos,
              btrim(v_att ->> 'full_name'),
              lower(btrim(v_att ->> 'email')),
              nullif(btrim(v_att ->> 'phone'), ''),
              coalesce(v_att -> 'answers', '{}'::jsonb));
    end loop;

    v_lines := v_lines || jsonb_build_object(
      'ticket_type_id', t.id, 'name', t.name,
      'unit_price_cents', t.price_cents, 'quantity', v_qty);
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_no, 'status', 'pending',
    'total_cents', v_subtotal, 'currency', e.currency, 'expires_at', v_expires,
    'existing', false, 'line_items', v_lines);
end;
$$;

-- ===========================================================================
-- SERVER: record the Stripe Checkout session created for an order
-- ===========================================================================
create or replace function public.attach_checkout_session(p_order_id uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
     set stripe_checkout_session_id = p_session_id
   where id = p_order_id and status = 'pending'
     and (stripe_checkout_session_id is null or stripe_checkout_session_id = p_session_id);
  if not found then
    raise exception 'order_not_pending' using errcode = 'P0001';
  end if;
end;
$$;

-- ===========================================================================
-- SERVER: release a pending order's holds (expired / failed / abandoned)
-- ===========================================================================
create or replace function public.release_order(
  p_order_id uuid,
  p_status   public.order_status,
  p_reason   text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  o public.orders;
begin
  if p_status not in ('cancelled', 'failed') then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'status must be cancelled or failed';
  end if;
  select event_id into v_event_id from public.orders where id = p_order_id;
  if not found then
    return 'not_found';
  end if;
  perform 1 from public.events where id = v_event_id for update;
  select * into o from public.orders where id = p_order_id for update;
  if o.status <> 'pending' then
    return 'noop_' || o.status::text;
  end if;
  update public.inventory_holds
     set status = 'released', resolved_at = now()
   where order_id = p_order_id and status = 'active';
  update public.orders
     set status = p_status, status_reason = left(p_reason, 300), cancelled_at = now()
   where id = p_order_id;
  return 'released';
end;
$$;

-- ===========================================================================
-- SERVER: fulfil an order after VERIFIED payment (webhook / free path).
-- Idempotent: a second call for a paid order is a no-op.
-- ===========================================================================
-- p_payment: { "provider": "stripe"|"free", "checkout_session_id", "payment_intent_id",
--              "amount_total": int, "currency": text }
-- p_tickets: [ { "attendee_id", "credential_hash", "credential_ciphertext", "manual_code" } ]
create or replace function public.fulfill_order(
  p_order_id uuid,
  p_payment  jsonb,
  p_tickets  jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id   uuid;
  o            public.orders;
  oi           public.order_items;
  v_provider   text := p_payment ->> 'provider';
  v_left       integer;
  v_event_left integer;
  v_adm        integer;
  v_problem    text;
  v_ticket_ids uuid[];
  v_att_count  integer;
begin
  select event_id into v_event_id from public.orders where id = p_order_id;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  perform 1 from public.events where id = v_event_id for update;
  select * into o from public.orders where id = p_order_id for update;

  if o.status in ('paid', 'refunded', 'partially_refunded') then
    return jsonb_build_object('outcome', 'already_fulfilled', 'order_id', o.id);
  end if;

  -- Verify payment facts against the order (never trust client values).
  if v_provider = 'free' then
    if o.total_cents <> 0 then
      raise exception 'payment_mismatch' using errcode = 'P0001', detail = 'free provider for paid order';
    end if;
  elsif v_provider = 'stripe' then
    if (p_payment ->> 'amount_total')::integer is distinct from o.total_cents then
      v_problem := 'amount_mismatch';
    elsif lower(p_payment ->> 'currency') is distinct from o.currency then
      v_problem := 'currency_mismatch';
    elsif o.stripe_checkout_session_id is not null
          and o.stripe_checkout_session_id is distinct from (p_payment ->> 'checkout_session_id') then
      v_problem := 'session_mismatch';
    end if;
  else
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'unknown provider';
  end if;

  -- Capacity re-check excluding this order's own holds. Normally the hold is
  -- still active; this matters when payment lands after the hold expired.
  if v_problem is null then
    v_adm := 0;
    for oi in select * from public.order_items where order_id = o.id loop
      v_left := public._ticket_type_remaining_units(oi.ticket_type_id, o.id);
      if v_left is not null and oi.quantity > v_left then
        v_problem := 'capacity_unavailable';
      end if;
      v_adm := v_adm + oi.quantity * oi.admits_per_unit;
    end loop;
    v_event_left := public._event_remaining_admissions(o.event_id, o.id);
    if v_event_left is not null and v_adm > v_event_left then
      v_problem := 'capacity_unavailable';
    end if;
  end if;

  if v_problem is not null then
    -- Money may have been taken: record as paid, flag for admin review/refund,
    -- issue NO tickets, release any holds.
    update public.inventory_holds set status = 'released', resolved_at = now()
     where order_id = o.id and status = 'active';
    update public.orders
       set status = 'paid', paid_at = now(), payment_provider = v_provider,
           stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_payment ->> 'checkout_session_id'),
           stripe_payment_intent_id = p_payment ->> 'payment_intent_id',
           needs_review = true, review_reason = v_problem
     where id = o.id;
    perform public.write_audit('order.needs_review', 'order', o.id::text, null, null,
                               jsonb_build_object('reason', v_problem));
    return jsonb_build_object('outcome', 'needs_review', 'reason', v_problem, 'order_id', o.id);
  end if;

  -- Tickets payload must cover exactly this order's attendees.
  select count(*) into v_att_count from public.attendees where order_id = o.id;
  if jsonb_typeof(p_tickets) <> 'array' or jsonb_array_length(p_tickets) <> v_att_count
     or exists (
       select 1 from public.attendees a where a.order_id = o.id
       and not exists (select 1 from jsonb_array_elements(p_tickets) x
                       where (x ->> 'attendee_id')::uuid = a.id)) then
    raise exception 'ticket_payload_mismatch' using errcode = 'P0001';
  end if;

  -- Commit inventory.
  for oi in select * from public.order_items where order_id = o.id loop
    update public.ticket_types set quantity_sold = quantity_sold + oi.quantity where id = oi.ticket_type_id;
  end loop;
  update public.events
     set admissions_sold = admissions_sold + (
       select sum(quantity * admits_per_unit) from public.order_items where order_id = o.id)
   where id = o.event_id;

  update public.inventory_holds set status = 'converted', resolved_at = now()
   where order_id = o.id and status in ('active', 'expired', 'released');

  update public.orders
     set status = 'paid', paid_at = now(), payment_provider = v_provider,
         status_reason = null, cancelled_at = null,
         stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_payment ->> 'checkout_session_id'),
         stripe_payment_intent_id = p_payment ->> 'payment_intent_id'
   where id = o.id;

  with ins as (
    insert into public.tickets (attendee_id, order_id, event_id, ticket_type_id,
                                credential_hash, credential_ciphertext, manual_code)
    select a.id, a.order_id, a.event_id, a.ticket_type_id,
           x ->> 'credential_hash', x ->> 'credential_ciphertext', x ->> 'manual_code'
    from jsonb_array_elements(p_tickets) x
    join public.attendees a on a.id = (x ->> 'attendee_id')::uuid and a.order_id = o.id
    returning id
  )
  select array_agg(id) into v_ticket_ids from ins;

  -- Exactly-once email enqueue.
  insert into public.email_messages (dedupe_key, kind, order_id, to_email)
  values ('order_confirmation:' || o.id, 'order_confirmation', o.id, o.purchaser_email)
  on conflict (dedupe_key) do nothing;

  insert into public.email_messages (dedupe_key, kind, order_id, ticket_id, to_email)
  select 'ticket:' || tk.id || ':v1', 'ticket', o.id, tk.id, a.email
  from public.tickets tk join public.attendees a on a.id = tk.attendee_id
  where tk.order_id = o.id
  on conflict (dedupe_key) do nothing;

  perform public.write_audit('order.paid', 'order', o.id::text, null, null,
                             jsonb_build_object('provider', v_provider, 'tickets', coalesce(array_length(v_ticket_ids, 1), 0)));

  return jsonb_build_object('outcome', 'fulfilled', 'order_id', o.id, 'ticket_ids', to_jsonb(v_ticket_ids));
end;
$$;

-- ===========================================================================
-- Internal: return selected tickets' admissions to inventory
-- ===========================================================================
create or replace function public._release_ticket_inventory(p_order_id uuid, p_ticket_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  oi        public.order_items;
  v_target  integer;
  v_delta   integer;
  v_total   integer := 0;
begin
  update public.tickets set inventory_released = true
   where order_id = p_order_id and id = any (p_ticket_ids) and status <> 'valid'
     and not inventory_released;

  for oi in select * from public.order_items where order_id = p_order_id for update loop
    select count(*) / oi.admits_per_unit into v_target
      from public.tickets tk join public.attendees a on a.id = tk.attendee_id
     where a.order_item_id = oi.id and tk.inventory_released;
    v_delta := v_target - oi.units_released;
    if v_delta > 0 then
      update public.order_items set units_released = units_released + v_delta where id = oi.id;
      update public.ticket_types set quantity_sold = quantity_sold - v_delta where id = oi.ticket_type_id;
      update public.events set admissions_sold = admissions_sold - v_delta * oi.admits_per_unit
       where id = oi.event_id;
      v_total := v_total + v_delta;
    end if;
  end loop;
  return v_total;
end;
$$;

-- ===========================================================================
-- SERVER: record a refund (admin-initiated or reconciled from Stripe dashboard)
-- Idempotent on stripe_refund_id.
-- ===========================================================================
create or replace function public.record_refund(
  p_order_id          uuid,
  p_amount_cents      integer,
  p_ticket_ids        uuid[],
  p_release_inventory boolean,
  p_stripe_refund_id  text,
  p_source            text,
  p_actor             uuid,
  p_reason            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  o          public.orders;
  v_tickets  uuid[] := coalesce(p_ticket_ids, '{}');
  v_released integer := 0;
  v_new_ref  integer;
  v_status   public.order_status;
  v_review   boolean := false;
begin
  if p_stripe_refund_id is not null
     and exists (select 1 from public.refunds where stripe_refund_id = p_stripe_refund_id) then
    return jsonb_build_object('outcome', 'already_recorded');
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  select event_id into v_event_id from public.orders where id = p_order_id;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  perform 1 from public.events where id = v_event_id for update;
  select * into o from public.orders where id = p_order_id for update;

  if o.status not in ('paid', 'partially_refunded') then
    raise exception 'order_not_refundable' using errcode = 'P0001', detail = o.status::text;
  end if;
  if o.amount_refunded_cents + p_amount_cents > o.total_cents then
    raise exception 'refund_exceeds_total' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_tickets) x
             where not exists (select 1 from public.tickets t where t.id = x and t.order_id = o.id)) then
    raise exception 'ticket_not_in_order' using errcode = 'P0001';
  end if;

  v_new_ref := o.amount_refunded_cents + p_amount_cents;

  -- Dashboard refunds don't say which tickets. Full refund => all tickets;
  -- partial => flag for admin to choose.
  if cardinality(v_tickets) = 0 then
    if v_new_ref = o.total_cents then
      select coalesce(array_agg(id), '{}') into v_tickets
        from public.tickets where order_id = o.id and status = 'valid';
    else
      v_review := true;
    end if;
  end if;

  update public.tickets set status = 'refunded', refunded_at = now()
   where id = any (v_tickets) and status = 'valid';

  if p_release_inventory then
    v_released := public._release_ticket_inventory(o.id, v_tickets);
  end if;

  v_status := (case when v_new_ref = o.total_cents then 'refunded' else 'partially_refunded' end)::public.order_status;
  update public.orders
     set amount_refunded_cents = v_new_ref, status = v_status,
         needs_review = needs_review or v_review,
         review_reason = case when v_review then 'partial_refund_unmapped' else review_reason end
   where id = o.id;

  insert into public.refunds (order_id, stripe_refund_id, amount_cents, ticket_ids,
                              released_inventory, reason, initiated_by, source)
  values (o.id, p_stripe_refund_id, p_amount_cents, v_tickets, p_release_inventory,
          left(p_reason, 500), p_actor, p_source);

  perform public.write_audit('order.refund', 'order', o.id::text, null, null,
    jsonb_build_object('amount_cents', p_amount_cents, 'tickets', to_jsonb(v_tickets),
                       'released_units', v_released, 'source', p_source),
    p_actor);

  return jsonb_build_object('outcome', 'recorded', 'status', v_status,
                            'refunded_tickets', to_jsonb(v_tickets),
                            'released_units', v_released, 'needs_review', v_review);
end;
$$;

-- ===========================================================================
-- ADMIN: cancel tickets without a refund (e.g. comps, duplicates)
-- ===========================================================================
create or replace function public.admin_cancel_tickets(
  p_ticket_ids        uuid[],
  p_release_inventory boolean,
  p_reason            text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid;
  v_event uuid;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select distinct t.order_id, t.event_id into v_order, v_event
    from public.tickets t where t.id = any (p_ticket_ids);
  if v_order is null or (select count(distinct order_id) from public.tickets where id = any (p_ticket_ids)) <> 1 then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'tickets must belong to one order';
  end if;
  perform 1 from public.events where id = v_event for update;
  perform 1 from public.orders where id = v_order for update;

  update public.tickets set status = 'cancelled', cancelled_at = now()
   where id = any (p_ticket_ids) and status = 'valid';
  get diagnostics v_count = row_count;

  if p_release_inventory then
    perform public._release_ticket_inventory(v_order, p_ticket_ids);
  end if;

  perform public.write_audit('ticket.cancel', 'order', v_order::text, null, null,
    jsonb_build_object('tickets', to_jsonb(p_ticket_ids), 'reason', p_reason,
                       'release_inventory', p_release_inventory));
  return v_count;
end;
$$;

-- ===========================================================================
-- STAFF: check-in (atomic; at most one accepted scan per ticket)
-- ===========================================================================
create or replace function public._check_in(
  p_event_id    uuid,
  p_ticket_id   uuid,
  p_method      text,
  p_hash_prefix text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  tk        public.tickets;
  v_order   public.order_status;
  v_result  public.check_in_result;
  v_updated public.tickets;
  v_info    jsonb;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  if p_ticket_id is not null then
    select * into tk from public.tickets where id = p_ticket_id;
  end if;

  if tk.id is null then
    v_result := 'invalid';
  else
    select status into v_order from public.orders where id = tk.order_id;
    if tk.event_id <> p_event_id then
      v_result := 'wrong_event';
    elsif tk.status = 'refunded' then
      v_result := 'refunded';
    elsif tk.status = 'cancelled' then
      v_result := 'cancelled';
    elsif v_order not in ('paid', 'partially_refunded') then
      v_result := 'invalid';
    else
      -- The atomic step: only one concurrent caller can flip checked_in_at.
      update public.tickets
         set checked_in_at = now(), checked_in_by = v_uid
       where id = tk.id and status = 'valid' and checked_in_at is null
      returning * into v_updated;
      if v_updated.id is not null then
        v_result := 'accepted';
        tk := v_updated;
      else
        v_result := 'already_checked_in';
        select * into tk from public.tickets where id = tk.id;
      end if;
    end if;
  end if;

  insert into public.check_ins (ticket_id, station_event_id, scanned_by, result, method, presented_hash_prefix)
  values (tk.id, p_event_id, v_uid, v_result, p_method, p_hash_prefix);

  if tk.id is not null then
    select jsonb_build_object(
      'ticket_id', tk.id,
      'manual_code', tk.manual_code,
      'attendee_name', a.full_name,
      'ticket_type', tt.name,
      'event_title', ev.title,
      'checked_in_at', tk.checked_in_at,
      'checked_in_by', (select ap.display_name from public.admin_profiles ap where ap.user_id = tk.checked_in_by))
    into v_info
    from public.attendees a, public.ticket_types tt, public.events ev
    where a.id = tk.attendee_id and tt.id = tk.ticket_type_id and ev.id = tk.event_id;
  end if;

  return jsonb_build_object('result', v_result, 'ticket', v_info);
end;
$$;

create or replace function public.check_in_by_credential(p_event_id uuid, p_credential_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket uuid;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_credential_hash !~ '^[0-9a-f]{64}$' then
    return public._check_in(p_event_id, null, 'qr', null);
  end if;
  select id into v_ticket from public.tickets where credential_hash = p_credential_hash;
  return public._check_in(p_event_id, v_ticket, 'qr', left(p_credential_hash, 12));
end;
$$;

create or replace function public.check_in_by_ticket(p_event_id uuid, p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public._check_in(p_event_id, p_ticket_id, 'manual', null);
end;
$$;

-- ADMIN: undo a mistaken check-in (audited).
create or replace function public.admin_undo_check_in(p_ticket_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.check_ins set voided_at = now(), voided_by = v_uid
   where ticket_id = p_ticket_id and result = 'accepted' and voided_at is null;
  update public.tickets set checked_in_at = null, checked_in_by = null
   where id = p_ticket_id and checked_in_at is not null;
  if not found then
    return false;
  end if;
  perform public.write_audit('ticket.undo_check_in', 'ticket', p_ticket_id::text, null, null,
                             jsonb_build_object('reason', p_reason));
  return true;
end;
$$;

-- STAFF: manual lookup by name / email / manual code / order number.
create or replace function public.lookup_tickets(p_event_id uuid, p_query text, p_limit integer default 25)
returns table (
  ticket_id     uuid,
  manual_code   text,
  attendee_name text,
  attendee_email text,
  ticket_type   text,
  status        public.ticket_validity,
  checked_in_at timestamptz,
  order_number  bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_query, ''));
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(q) < 2 then
    return;
  end if;
  return query
    select tk.id, tk.manual_code, a.full_name, a.email, tt.name, tk.status, tk.checked_in_at, o.order_number
    from public.tickets tk
    join public.attendees a on a.id = tk.attendee_id
    join public.ticket_types tt on tt.id = tk.ticket_type_id
    join public.orders o on o.id = tk.order_id
    where tk.event_id = p_event_id
      and (
        a.full_name ilike '%' || replace(replace(q, '%', '\%'), '_', '\_') || '%'
        or a.email like lower(replace(replace(q, '%', '\%'), '_', '\_')) || '%'
        or tk.manual_code = upper(replace(q, '-', ''))
        or (q ~ '^[0-9]{1,18}$' and o.order_number = q::bigint)
      )
    order by a.full_name
    limit least(greatest(coalesce(p_limit, 25), 1), 100);
end;
$$;

-- STAFF: attendance totals.
create or replace function public.event_attendance(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'valid_tickets', (select count(*) from public.tickets where event_id = p_event_id and status = 'valid'),
    'checked_in', (select count(*) from public.tickets
                   where event_id = p_event_id and status = 'valid' and checked_in_at is not null),
    'by_type', coalesce((
      select jsonb_agg(jsonb_build_object('ticket_type', tt.name, 'valid', x.valid, 'checked_in', x.checked_in)
                       order by tt.sort_order)
      from public.ticket_types tt
      join lateral (
        select count(*) filter (where tk.status = 'valid') as valid,
               count(*) filter (where tk.status = 'valid' and tk.checked_in_at is not null) as checked_in
        from public.tickets tk where tk.ticket_type_id = tt.id) x on true
      where tt.event_id = p_event_id), '[]'::jsonb));
end;
$$;

-- STAFF: recent scans at a station.
create or replace function public.recent_check_ins(p_event_id uuid, p_limit integer default 20)
returns table (
  scanned_at    timestamptz,
  result        public.check_in_result,
  method        text,
  attendee_name text,
  ticket_type   text,
  scanned_by    text,
  voided        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select c.scanned_at, c.result, c.method, a.full_name, tt.name, ap.display_name, c.voided_at is not null
    from public.check_ins c
    left join public.tickets tk on tk.id = c.ticket_id
    left join public.attendees a on a.id = tk.attendee_id
    left join public.ticket_types tt on tt.id = tk.ticket_type_id
    left join public.admin_profiles ap on ap.user_id = c.scanned_by
    where c.station_event_id = p_event_id
    order by c.scanned_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- ===========================================================================
-- SERVER: ticket credential rotation and email (re)send
-- ===========================================================================
create or replace function public.rotate_ticket_credential(
  p_ticket_id      uuid,
  p_new_hash       text,
  p_new_ciphertext text,
  p_actor          uuid,
  p_reason         text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  update public.tickets
     set credential_hash = p_new_hash, credential_ciphertext = p_new_ciphertext,
         credential_version = credential_version + 1, credential_rotated_at = now()
   where id = p_ticket_id and status = 'valid'
  returning credential_version into v_version;
  if v_version is null then
    raise exception 'ticket_not_valid' using errcode = 'P0001';
  end if;
  perform public.write_audit('ticket.rotate_credential', 'ticket', p_ticket_id::text, null, null,
                             jsonb_build_object('version', v_version, 'reason', p_reason), p_actor);
  return v_version;
end;
$$;

create or replace function public.enqueue_ticket_resend(p_ticket_id uuid, p_actor uuid, p_to_email text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_email text;
  v_order uuid;
begin
  select coalesce(lower(btrim(p_to_email)), a.email), tk.order_id into v_email, v_order
    from public.tickets tk join public.attendees a on a.id = tk.attendee_id
   where tk.id = p_ticket_id and tk.status = 'valid';
  if v_email is null then
    raise exception 'ticket_not_valid' using errcode = 'P0001';
  end if;
  insert into public.email_messages (dedupe_key, kind, order_id, ticket_id, to_email, requested_by)
  values ('ticket_resend:' || p_ticket_id || ':' || gen_random_uuid(), 'ticket_resend',
          v_order, p_ticket_id, v_email, p_actor)
  returning id into v_id;
  perform public.write_audit('ticket.resend', 'ticket', p_ticket_id::text, null, null,
                             jsonb_build_object('to', v_email), p_actor);
  return v_id;
end;
$$;

-- Claim due outbox messages (safe with concurrent workers).
create or replace function public.claim_due_emails(p_limit integer default 20)
returns setof public.email_messages
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.email_messages m
       set status = 'sending', attempts = m.attempts + 1,
           locked_until = now() + interval '5 minutes'
     where m.id in (
       select id from public.email_messages
        where ((status in ('queued', 'failed') and next_attempt_at <= now() and attempts < 8)
               or (status = 'sending' and locked_until < now() and attempts < 8))
        order by next_attempt_at
        limit least(greatest(coalesce(p_limit, 20), 1), 100)
        for update skip locked)
    returning m.*;
end;
$$;

create or replace function public.mark_email_result(
  p_id uuid, p_success boolean, p_provider_message_id text default null, p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_success then
    update public.email_messages
       set status = 'sent', sent_at = now(), provider_message_id = p_provider_message_id,
           locked_until = null, last_error = null
     where id = p_id;
  else
    update public.email_messages
       set status = 'failed', locked_until = null, last_error = left(p_error, 1000),
           next_attempt_at = now() + make_interval(mins => least(power(2, attempts)::integer, 240))
     where id = p_id;
  end if;
end;
$$;

-- ===========================================================================
-- SERVER: rate limiting (fixed window)
-- ===========================================================================
create or replace function public.check_rate_limit(
  p_bucket text, p_key_hash text, p_limit integer, p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key_hash, v_window, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- ===========================================================================
-- SERVER / CRON: expire holds and abandoned orders; prune rate-limit rows.
-- ===========================================================================
create or replace function public.sweep_expired()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orders integer := 0;
  v_holds  integer := 0;
  v_rl     integer := 0;
  r        record;
begin
  for r in
    select id from public.orders
     where status = 'pending' and expires_at < now() - interval '1 minute'
     order by expires_at limit 500
  loop
    if public.release_order(r.id, 'cancelled', 'checkout_expired') = 'released' then
      v_orders := v_orders + 1;
    end if;
  end loop;

  update public.inventory_holds set status = 'expired', resolved_at = now()
   where status = 'active' and expires_at < now();
  get diagnostics v_holds = row_count;

  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_rl = row_count;

  return jsonb_build_object('orders_cancelled', v_orders, 'holds_expired', v_holds,
                            'rate_limit_rows_pruned', v_rl);
end;
$$;

-- ===========================================================================
-- OWNER: staff management
-- ===========================================================================
create or replace function public.owner_set_staff(
  p_user_id uuid, p_role public.staff_role, p_is_active boolean, p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.admin_profiles (user_id, role, is_active, display_name)
  values (p_user_id, p_role, p_is_active, p_display_name)
  on conflict (user_id) do update
    set role = excluded.role, is_active = excluded.is_active,
        display_name = coalesce(excluded.display_name, public.admin_profiles.display_name);
  if not exists (select 1 from public.admin_profiles where role = 'owner' and is_active) then
    raise exception 'last_owner' using errcode = 'P0001', detail = 'At least one active owner is required';
  end if;
end;
$$;

-- ===========================================================================
-- ADMIN: exports (CSV is produced by the app; every export is audited)
-- ===========================================================================
create or replace function public.export_attendees(p_event_id uuid)
returns table (
  order_number   bigint,
  purchaser_name text,
  purchaser_email text,
  attendee_name  text,
  attendee_email text,
  attendee_phone text,
  ticket_type    text,
  manual_code    text,
  ticket_status  public.ticket_validity,
  checked_in_at  timestamptz,
  answers        jsonb,
  order_status   public.order_status,
  paid_at        timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.write_audit('export.attendees', 'event', p_event_id::text);
  return query
    select o.order_number, o.purchaser_name, o.purchaser_email, a.full_name, a.email, a.phone,
           tt.name, tk.manual_code, tk.status, tk.checked_in_at, a.answers, o.status, o.paid_at
    from public.tickets tk
    join public.attendees a on a.id = tk.attendee_id
    join public.orders o on o.id = tk.order_id
    join public.ticket_types tt on tt.id = tk.ticket_type_id
    where tk.event_id = p_event_id
    order by o.order_number, a.position;
end;
$$;

create or replace function public.export_sales(p_event_id uuid)
returns table (
  order_number          bigint,
  created_at            timestamptz,
  paid_at               timestamptz,
  status                public.order_status,
  purchaser_name        text,
  purchaser_email       text,
  items                 text,
  ticket_count          integer,
  currency              text,
  subtotal_cents        integer,
  discount_cents        integer,
  fee_cents             integer,
  total_cents           integer,
  amount_refunded_cents integer,
  net_cents             integer,
  stripe_payment_intent_id text,
  needs_review          boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.write_audit('export.sales', 'event', p_event_id::text);
  return query
    select o.order_number, o.created_at, o.paid_at, o.status, o.purchaser_name, o.purchaser_email,
           (select string_agg(oi.quantity || ' x ' || oi.ticket_type_name, '; ' order by oi.created_at)
              from public.order_items oi where oi.order_id = o.id),
           (select count(*)::integer from public.tickets tk where tk.order_id = o.id),
           o.currency, o.subtotal_cents, o.discount_cents, o.fee_cents, o.total_cents,
           o.amount_refunded_cents, o.total_cents - o.amount_refunded_cents,
           o.stripe_payment_intent_id, o.needs_review
    from public.orders o
    where o.event_id = p_event_id and o.status in ('paid', 'refunded', 'partially_refunded')
    order by o.order_number;
end;
$$;

-- Summary for dashboards (admin).
create or replace function public.event_sales_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'orders_paid', (select count(*) from public.orders
                    where event_id = p_event_id and status in ('paid', 'partially_refunded', 'refunded')),
    'gross_cents', (select coalesce(sum(total_cents), 0) from public.orders
                    where event_id = p_event_id and status in ('paid', 'partially_refunded', 'refunded')),
    'refunded_cents', (select coalesce(sum(amount_refunded_cents), 0) from public.orders
                       where event_id = p_event_id),
    'admissions_sold', (select admissions_sold from public.events where id = p_event_id),
    'by_type', coalesce((
      select jsonb_agg(jsonb_build_object('ticket_type', t.name, 'units_sold', t.quantity_sold,
                                          'capacity', t.capacity) order by t.sort_order)
      from public.ticket_types t where t.event_id = p_event_id), '[]'::jsonb));
end;
$$;

-- ===========================================================================
-- Grants for functions (everything was revoked in 0006 / default privileges)
-- ===========================================================================
revoke all on all functions in schema public from public, anon, authenticated;

-- RLS helpers
grant execute on function public.current_staff_role(), public.is_staff(), public.is_admin(),
                          public.is_owner()
  to authenticated;

-- Public
grant execute on function public.get_event_ticket_options(uuid) to anon, authenticated;

-- Staff (role checked inside each function)
grant execute on function
  public.check_in_by_credential(uuid, text),
  public.check_in_by_ticket(uuid, uuid),
  public.lookup_tickets(uuid, text, integer),
  public.event_attendance(uuid),
  public.recent_check_ins(uuid, integer),
  public.admin_undo_check_in(uuid, text),
  public.admin_cancel_tickets(uuid[], boolean, text),
  public.owner_set_staff(uuid, public.staff_role, boolean, text),
  public.export_attendees(uuid),
  public.export_sales(uuid),
  public.event_sales_summary(uuid)
  to authenticated;

-- Server only (secret key). Internal helpers (_*) and write_audit get no grant
-- beyond the owner; service_role reaches them only through these entry points.
revoke all on function
  public._ticket_type_remaining_units(uuid, uuid),
  public._event_remaining_admissions(uuid, uuid),
  public._release_ticket_inventory(uuid, uuid[]),
  public._check_in(uuid, uuid, text, text),
  public.write_audit(text, text, text, jsonb, jsonb, jsonb, uuid)
  from service_role;

grant execute on function
  public.create_pending_order(jsonb),
  public.attach_checkout_session(uuid, text),
  public.release_order(uuid, public.order_status, text),
  public.fulfill_order(uuid, jsonb, jsonb),
  public.record_refund(uuid, integer, uuid[], boolean, text, text, uuid, text),
  public.rotate_ticket_credential(uuid, text, text, uuid, text),
  public.enqueue_ticket_resend(uuid, uuid, text),
  public.claim_due_emails(integer),
  public.mark_email_result(uuid, boolean, text, text),
  public.check_rate_limit(text, text, integer, integer),
  public.sweep_expired(),
  public.get_event_ticket_options(uuid)
  to service_role;
