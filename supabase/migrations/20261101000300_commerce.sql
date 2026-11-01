-- PynkPours — 0003 Commerce: orders, line items, attendees, inventory holds,
-- tickets, refunds. All writes happen through trusted RPCs (0007).

-- ---------------------------------------------------------------------------
-- Orders (guest checkout; one event per order)
-- ---------------------------------------------------------------------------
create table public.orders (
  id                         uuid primary key default gen_random_uuid(),
  -- Human-friendly reference for support. Sequential, so NEVER used for access.
  order_number               bigint generated always as identity unique,
  event_id                   uuid not null references public.events (id) on delete restrict,
  purchaser_name             text not null check (char_length(purchaser_name) between 1 and 160),
  purchaser_email            text not null check (
                               purchaser_email = lower(btrim(purchaser_email))
                               and purchaser_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                               and char_length(purchaser_email) <= 254),
  purchaser_phone            text check (purchaser_phone is null or char_length(purchaser_phone) <= 40),
  currency                   text not null check (currency ~ '^[a-z]{3}$'),
  subtotal_cents             integer not null check (subtotal_cents >= 0),
  discount_cents             integer not null default 0 check (discount_cents >= 0),
  fee_cents                  integer not null default 0 check (fee_cents >= 0),
  total_cents                integer not null check (total_cents >= 0),
  amount_refunded_cents      integer not null default 0 check (amount_refunded_cents >= 0),
  status                     public.order_status not null default 'pending',
  status_reason              text check (status_reason is null or char_length(status_reason) <= 300),
  payment_provider           text check (payment_provider in ('stripe', 'free')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  -- Client-generated per checkout form render; prevents duplicate orders on double-submit.
  checkout_idempotency_key   text not null unique check (char_length(checkout_idempotency_key) between 16 and 100),
  -- SHA-256 (hex) of the random token in the guest's order-status URL.
  public_token_hash          text not null unique check (public_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at                 timestamptz not null,
  paid_at                    timestamptz,
  cancelled_at               timestamptz,
  needs_review               boolean not null default false,
  review_reason              text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint orders_id_event_unique unique (id, event_id),
  constraint orders_total_math check (total_cents = subtotal_cents - discount_cents + fee_cents),
  constraint orders_refund_le_total check (amount_refunded_cents <= total_cents),
  constraint orders_paid_at check (
    status not in ('paid', 'refunded', 'partially_refunded') or paid_at is not null
  )
);

create index orders_event_status_idx on public.orders (event_id, status);
create index orders_purchaser_email_idx on public.orders (purchaser_email);
create index orders_pending_expiry_idx on public.orders (expires_at) where status = 'pending';
create index orders_needs_review_idx on public.orders (created_at) where needs_review;

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Line items: price snapshot at time of purchase.
-- ---------------------------------------------------------------------------
create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null,
  event_id          uuid not null,
  ticket_type_id    uuid not null,
  ticket_type_name  text not null,
  unit_price_cents  integer not null check (unit_price_cents >= 0),
  quantity          integer not null check (quantity between 1 and 50),
  admits_per_unit   integer not null check (admits_per_unit between 1 and 20),
  line_total_cents  integer not null,
  -- Units returned to inventory after refunds/cancellations (server-maintained).
  units_released    integer not null default 0 check (units_released >= 0 and units_released <= quantity),
  created_at        timestamptz not null default now(),
  constraint order_items_line_math check (line_total_cents = unit_price_cents * quantity),
  constraint order_items_one_per_type unique (order_id, ticket_type_id),
  constraint order_items_key unique (id, order_id, event_id, ticket_type_id),
  foreign key (order_id, event_id) references public.orders (id, event_id) on delete restrict,
  foreign key (ticket_type_id, event_id) references public.ticket_types (id, event_id) on delete restrict
);

create index order_items_ticket_type_idx on public.order_items (ticket_type_id);

-- ---------------------------------------------------------------------------
-- Attendees: one per admission (not per unit). No login; no profile.
-- ---------------------------------------------------------------------------
create table public.attendees (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null,
  order_id       uuid not null,
  event_id       uuid not null,
  ticket_type_id uuid not null,
  position       integer not null check (position >= 1),
  full_name      text not null check (char_length(full_name) between 1 and 160),
  email          text not null check (
                   email = lower(btrim(email))
                   and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                   and char_length(email) <= 254),
  phone          text check (phone is null or char_length(phone) <= 40),
  -- { "<event_question_id>": "answer" }
  answers        jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint attendees_position_unique unique (order_id, position),
  constraint attendees_key unique (id, order_id, event_id, ticket_type_id),
  foreign key (order_item_id, order_id, event_id, ticket_type_id)
    references public.order_items (id, order_id, event_id, ticket_type_id) on delete restrict
);

create index attendees_order_idx on public.attendees (order_id);
create index attendees_ticket_type_idx on public.attendees (ticket_type_id);
create index attendees_event_idx on public.attendees (event_id);
create index attendees_email_idx on public.attendees (email);
create index attendees_name_trgm_idx on public.attendees using gin (full_name extensions.gin_trgm_ops);

create trigger attendees_set_updated_at
  before update on public.attendees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory holds: seats reserved while the guest pays. Expired holds are
-- ignored by availability math immediately (lazy expiry), so correctness never
-- depends on the cleanup sweep having run.
-- ---------------------------------------------------------------------------
create table public.inventory_holds (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null,
  event_id       uuid not null,
  ticket_type_id uuid not null,
  quantity       integer not null check (quantity between 1 and 50),
  admissions     integer not null check (admissions >= 1),
  status         public.hold_status not null default 'active',
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  constraint inventory_holds_one_per_type unique (order_id, ticket_type_id),
  foreign key (order_id, event_id) references public.orders (id, event_id) on delete restrict,
  foreign key (ticket_type_id, event_id) references public.ticket_types (id, event_id) on delete restrict
);

create index inventory_holds_active_type_idx
  on public.inventory_holds (ticket_type_id, expires_at) where status = 'active';
create index inventory_holds_active_event_idx
  on public.inventory_holds (event_id, expires_at) where status = 'active';

-- ---------------------------------------------------------------------------
-- Tickets: one per attendee, issued only after verified payment.
-- ---------------------------------------------------------------------------
create table public.tickets (
  id                    uuid primary key default gen_random_uuid(),
  attendee_id           uuid not null unique,
  order_id              uuid not null,
  event_id              uuid not null,
  ticket_type_id        uuid not null,
  -- SHA-256 (hex) of the 256-bit random QR credential. Used for lookup.
  credential_hash       text not null unique check (credential_hash ~ '^[0-9a-f]{64}$'),
  -- AES-256-GCM ciphertext of the credential, encrypted by the app server with a
  -- key that never reaches the database (TICKET_CREDENTIAL_KEY). Lets the guest's
  -- ticket page and email retries re-render the QR without storing it in plaintext.
  credential_ciphertext text not null check (char_length(credential_ciphertext) between 20 and 500),
  credential_version    integer not null default 1 check (credential_version >= 1),
  credential_rotated_at timestamptz,
  -- Short random code for staff manual lookup (unambiguous alphabet). Not an entry credential.
  manual_code           text not null unique check (manual_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  status                public.ticket_validity not null default 'valid',
  -- True once this admission has been returned to inventory.
  inventory_released    boolean not null default false,
  issued_at             timestamptz not null default now(),
  checked_in_at         timestamptz,
  checked_in_by         uuid references auth.users (id) on delete set null,
  cancelled_at          timestamptz,
  refunded_at           timestamptz,
  updated_at            timestamptz not null default now(),
  foreign key (attendee_id, order_id, event_id, ticket_type_id)
    references public.attendees (id, order_id, event_id, ticket_type_id) on delete restrict,
  constraint tickets_refunded_at check ((status = 'refunded') = (refunded_at is not null)),
  constraint tickets_cancelled_at check ((status = 'cancelled') = (cancelled_at is not null))
);

create index tickets_order_idx on public.tickets (order_id);
create index tickets_event_status_idx on public.tickets (event_id, status);
create index tickets_ticket_type_idx on public.tickets (ticket_type_id);
create index tickets_event_checked_in_idx on public.tickets (event_id, checked_in_at desc)
  where checked_in_at is not null;

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Refunds (idempotent on Stripe refund id)
-- ---------------------------------------------------------------------------
create table public.refunds (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete restrict,
  stripe_refund_id  text unique,
  amount_cents      integer not null check (amount_cents > 0),
  ticket_ids        uuid[] not null default '{}',
  released_inventory boolean not null default false,
  reason            text check (reason is null or char_length(reason) <= 500),
  initiated_by      uuid references auth.users (id) on delete set null,
  source            text not null check (source in ('admin', 'stripe_dashboard')),
  created_at        timestamptz not null default now()
);

create index refunds_order_idx on public.refunds (order_id);
