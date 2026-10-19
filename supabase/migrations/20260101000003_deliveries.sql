-- Koursa — 3. Courses, offres, journal, notes, positions, lieux, incidents

create type public.delivery_status as enum (
  'pending', 'searching', 'assigned', 'picked_up', 'delivering', 'delivered',
  'cancelled_by_client', 'cancelled_by_courier', 'unassigned', 'failed'
);
create type public.package_size as enum ('small', 'medium', 'large');
create type public.payer as enum ('sender', 'recipient');
create type public.offer_response as enum ('pending', 'accepted', 'declined', 'expired');

-- Partie visible par le client ET par le coursier assigné.
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  courier_id uuid references public.couriers(id),
  city_id uuid not null references public.cities(id),
  status public.delivery_status not null default 'pending',
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_point extensions.geography(Point, 4326) generated always as (public.make_point(pickup_lat, pickup_lng)) stored,
  pickup_address text not null default '',
  pickup_landmark text not null,
  pickup_place_id text,
  pickup_zone_id uuid not null references public.zones(id),
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_point extensions.geography(Point, 4326) generated always as (public.make_point(dropoff_lat, dropoff_lng)) stored,
  dropoff_address text not null default '',
  dropoff_landmark text not null,
  dropoff_place_id text,
  dropoff_zone_id uuid references public.zones(id),
  recipient_name text not null,
  recipient_phone text not null,
  size public.package_size not null,
  payer public.payer not null,
  note text,
  distance_m integer not null check (distance_m >= 0),
  duration_s integer not null check (duration_s >= 0),
  -- Prix figé à la commande : jamais modifiable par le client ni le coursier.
  price_locked integer not null check (price_locked > 0),
  currency text not null check (currency in ('XOF', 'XAF')),
  waiting_pickup_fee integer not null default 0,
  waiting_dropoff_fee integer not null default 0,
  waiting_refused boolean not null default false,
  amount_collected_pickup integer,
  amount_collected_dropoff integer,
  total_collected integer,
  tracking_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  cancel_reason text,
  search_started_at timestamptz,
  assigned_at timestamptz,
  arrived_pickup_at timestamptz,
  picked_up_at timestamptz,
  delivering_at timestamptz,
  arrived_dropoff_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deliveries_client_idx on public.deliveries (client_id, created_at desc);
create index deliveries_courier_idx on public.deliveries (courier_id, created_at desc);
create index deliveries_status_idx on public.deliveries (city_id, status);
create index deliveries_zone_idx on public.deliveries (pickup_zone_id, created_at desc);
create index deliveries_pickup_gix on public.deliveries using gist (pickup_point);

-- Partie interne : jamais lisible par le client (tolérance restaurant, hash du code, argent).
create table public.delivery_private (
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  pickup_grace_min integer not null,
  dropoff_grace_min integer not null,
  pickup_is_restaurant boolean not null default false,
  pickup_types text[] not null default '{}',
  dropoff_types text[] not null default '{}',
  pickup_venue_id uuid,
  code_hash text not null,
  commission integer,
  courier_share integer not null,
  approach_m integer,
  approach_bonus integer,
  approach_bonus_credited_at timestamptz,
  late_penalty integer,
  late_penalty_status text check (late_penalty_status in ('applied', 'waived', 'pending_review')),
  wave smallint not null default 1,
  wave_started_at timestamptz,
  code_sms_sent_at timestamptz,
  degraded_route boolean not null default false
);

create table public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  wave smallint not null,
  distance_m integer not null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  response public.offer_response not null default 'pending',
  responded_at timestamptz,
  -- Résumé affiché au coursier (il ne lit pas la course tant qu'il n'a pas accepté).
  summary jsonb not null default '{}'::jsonb,
  unique (delivery_id, courier_id)
);
create index offers_courier_idx on public.delivery_offers (courier_id, response);
create index offers_delivery_idx on public.delivery_offers (delivery_id);

create table public.delivery_events (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  from_status public.delivery_status,
  to_status public.delivery_status,
  kind text not null,
  actor_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index delivery_events_delivery_idx on public.delivery_events (delivery_id, created_at);

create table public.ratings (
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  courier_id uuid not null references public.couriers(id),
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Historique léger pendant une course (suivi en temps réel).
create table public.courier_locations (
  id bigint generated always as identity primary key,
  courier_id uuid not null references public.couriers(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete cascade,
  point extensions.geography(Point, 4326) not null,
  lat double precision not null,
  lng double precision not null,
  heading real,
  speed real,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index courier_locations_delivery_idx on public.courier_locations (delivery_id, recorded_at desc);

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default '',
  lat double precision not null,
  lng double precision not null,
  point extensions.geography(Point, 4326) generated always as (public.make_point(lat, lng)) stored,
  address text not null default '',
  landmark text not null default '',
  place_id text,
  favorite boolean not null default false,
  use_count integer not null default 1,
  last_used_at timestamptz not null default now()
);
create index saved_places_user_idx on public.saved_places (user_id, last_used_at desc);

create type public.venue_source as enum ('google', 'admin', 'courier');

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id),
  place_id text,
  point extensions.geography(Point, 4326) not null,
  name text not null,
  kind text not null default 'restaurant',
  is_restaurant boolean not null default true,
  source public.venue_source not null,
  validated boolean not null default false,
  reported_by uuid references public.profiles(id),
  avg_wait_s integer,
  wait_samples integer not null default 0,
  created_at timestamptz not null default now()
);
create index venues_point_gix on public.venues using gist (point);
create unique index venues_place_id_uidx on public.venues (place_id) where place_id is not null;

-- Attente réelle mesurée par lieu (ajuster plus tard la tolérance restaurant).
create table public.waiting_logs (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  stop text not null check (stop in ('pickup', 'dropoff')),
  venue_id uuid references public.venues(id),
  place_id text,
  waited_s integer not null,
  fee integer not null,
  created_at timestamptz not null default now()
);

create type public.incident_status as enum ('open', 'validated', 'rejected');

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers(id),
  delivery_id uuid references public.deliveries(id),
  kind text not null check (kind in ('breakdown', 'accident', 'police_check', 'other', 'waiting_refused', 'client_absent', 'dispute')),
  description text not null default '',
  status public.incident_status not null default 'open',
  admin_comment text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index incidents_status_idx on public.incidents (status, created_at desc);

create table public.admin_alerts (
  id bigint generated always as identity primary key,
  city_id uuid references public.cities(id),
  zone_id uuid references public.zones(id),
  kind text not null,
  message text not null,
  delivery_id uuid references public.deliveries(id) on delete cascade,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.outbox_sms (
  id bigint generated always as identity primary key,
  to_phone text not null,
  body text not null,
  delivery_id uuid references public.deliveries(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
