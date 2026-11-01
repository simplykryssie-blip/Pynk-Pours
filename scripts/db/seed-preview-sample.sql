-- Run ONLY in the PynkPours Preview project (msbkdryzxqznksmiftqx), via the Supabase SQL editor or MCP.
-- Refuses to run if any events already exist. Requires pgcrypto in the "extensions" schema (Supabase default).
-- PynkPours PREVIEW sample data. Everything except the Brunch "coming soon" page is labelled SAMPLE.
do $seed$
declare
  v_brunch uuid; v_social uuid; v_sold uuid; v_past uuid;
  v_tiers uuid[]; v_prices int[];
  v_order jsonb; v_tickets jsonb;
  p record; i int; v_email text; v_att jsonb;
  d0 timestamptz := date_trunc('day', now());
begin
  if exists (select 1 from public.events) then
    raise exception 'preview already has events; refusing to seed twice';
  end if;

  insert into public.events (slug, title, category_label, short_description, description, registration_mode, is_featured)
  values ('entrepreneurial-brunch', 'The Entrepreneurial Brunch', 'Signature Experience',
    'Our signature entrepreneurial gathering brings business owners, emerging founders, and creative thinkers together for conversation, connection, practical insight, and intentional networking.',
    'Big ideas deserve the right room. Event date, venue, ticket details, and speaker announcements will be shared here as they are confirmed.',
    'coming_soon', true) returning id into v_brunch;
  update public.events set status = 'published' where id = v_brunch;

  insert into public.events (slug, title, category_label, short_description, description, starts_at, ends_at, timezone,
    venue_name, venue_address, dress_code, min_age, agenda, faqs, registration_mode, show_remaining_count)
  values ('sample-networking-social', 'SAMPLE Networking Social (not a real event)', 'Sample',
    'SAMPLE DATA for preview testing. Not a real PynkPours event.',
    E'This sample event exists only to exercise the event page layout.\n\nIt is not real.',
    d0 + interval '21 days 23 hours', d0 + interval '22 days 2 hours', 'America/Chicago',
    'Sample Venue (fictional)', '123 Example Street, Example City', 'Sample dress code', 21,
    '[{"time":"6:00 PM","title":"Sample welcome"},{"time":"7:00 PM","title":"Sample networking"}]',
    '[{"question":"Is this a real event?","answer":"No. This is sample data for preview testing."}]',
    'tickets', true) returning id into v_social;
  insert into public.ticket_types (event_id, name, price_cents, capacity, sort_order, inclusions)
    values (v_social, 'Sample General Admission', 2500, 40, 0, '["Sample inclusion one","Sample inclusion two"]');
  insert into public.ticket_types (event_id, name, price_cents, capacity, sort_order, max_per_order, description)
    values (v_social, 'Sample VIP', 6000, 10, 1, 2, 'Optional premium tier (VIP is never required).');
  insert into public.ticket_types (event_id, name, price_cents, capacity, sort_order, max_per_order, admits_per_unit, description, inclusions)
    values (v_social, 'Sample Table for 4', 20000, 3, 2, 1, 4, 'One reserved table; each of the 4 guests gets their own ticket.', '["Reserved table","4 individual tickets"]');
  update public.events set status = 'published' where id = v_social;

  insert into public.events (slug, title, category_label, short_description, starts_at, ends_at, timezone, is_online, registration_mode, sold_out_behavior)
  values ('sample-sold-out-workshop', 'SAMPLE Sold-Out Workshop (not a real event)', 'Sample',
    'SAMPLE DATA: demonstrates the sold-out + waitlist state.',
    d0 + interval '35 days 17 hours', d0 + interval '35 days 20 hours', 'America/Chicago', true, 'tickets', 'waitlist')
  returning id into v_sold;
  insert into public.ticket_types (event_id, name, price_cents, capacity) values (v_sold, 'Sample Seat', 1500, 0);
  update public.events set status = 'published' where id = v_sold;

  insert into public.events (slug, title, category_label, short_description, starts_at, ends_at, timezone, venue_name, registration_mode)
  values ('sample-past-gathering', 'SAMPLE Past Gathering (not a real event)', 'Sample',
    'SAMPLE DATA: demonstrates the past-events view.',
    d0 - interval '30 days' + interval '17 hours', d0 - interval '30 days' + interval '20 hours', 'America/Chicago',
    'Sample Venue (fictional)', 'closed') returning id into v_past;
  update public.events set status = 'published' where id = v_past;

  insert into public.events (slug, title, short_description, registration_mode)
  values ('sample-draft-hidden', 'SAMPLE DRAFT — must not be public', 'If you can see this on the public site, RLS is broken.', 'coming_soon');

  select array_agg(id order by sort_order), array_agg(price_cents order by sort_order) into v_tiers, v_prices
    from public.ticket_types where event_id = v_social;

  for p in select * from (values ('Sample Guest Avery',1,2),('Sample Guest Blake',1,1),('Sample Guest Casey',2,1),
                                 ('Sample Guest Devon',1,3),('Sample Guest Emery',2,2)) as t(name, tier, qty) loop
    v_email := lower(split_part(p.name, ' ', 3)) || '@example.test';
    v_att := '[]'::jsonb;
    for i in 1..p.qty loop
      v_att := v_att || jsonb_build_object('ticket_type_id', v_tiers[p.tier],
        'full_name', case when i = 1 then p.name else p.name || ' +' || (i-1) end, 'email', v_email, 'answers', '{}'::jsonb);
    end loop;
    v_order := public.create_pending_order(jsonb_build_object(
      'event_id', v_social, 'idempotency_key', 'preview_seed_' || encode(extensions.gen_random_bytes(12), 'hex'),
      'public_token_hash', encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex'),
      'hold_minutes', 35, 'purchaser', jsonb_build_object('name', p.name, 'email', v_email),
      'items', jsonb_build_array(jsonb_build_object('ticket_type_id', v_tiers[p.tier], 'quantity', p.qty)),
      'attendees', v_att));
    -- Credentials are random and discarded: sample tickets are for manual check-in only.
    select jsonb_agg(jsonb_build_object(
        'attendee_id', a.id,
        'credential_hash', encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex'),
        'credential_ciphertext', 'sample-placeholder-not-decryptable-' || encode(extensions.gen_random_bytes(8), 'hex'),
        'manual_code', (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b, k) % 32) + 1, 1), '' order by k)
                        from (select extensions.gen_random_bytes(8) b where a.id is not null) r, generate_series(0, 7) k)))
      into v_tickets
      from public.attendees a where a.order_id = (v_order ->> 'order_id')::uuid;
    perform public.fulfill_order((v_order ->> 'order_id')::uuid,
      jsonb_build_object('provider', 'stripe', 'checkout_session_id', 'cs_sample_' || encode(extensions.gen_random_bytes(6), 'hex'),
        'payment_intent_id', 'pi_sample_' || encode(extensions.gen_random_bytes(6), 'hex'),
        'amount_total', (v_order ->> 'total_cents')::int, 'currency', 'usd'),
      v_tickets);
  end loop;

  update public.tickets set checked_in_at = now() - interval '5 minutes'
   where id in (select id from public.tickets where event_id = v_social order by issued_at limit 2);

  insert into public.contact_submissions (name, email, topic, message)
  values ('Sample Sender', 'sender@example.test', 'partnership', 'SAMPLE message: we would love to sponsor a future event.');
end
$seed$;
