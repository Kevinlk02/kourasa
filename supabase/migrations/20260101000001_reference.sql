-- Koursa — 1. Extensions, pays, villes, zones (docs/MVP.md §6-7, docs/ZONES.md)

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Point helper
create or replace function public.make_point(p_lat double precision, p_lng double precision)
returns extensions.geography
language sql immutable
set search_path = public, extensions
as $$ select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography $$;

-- ---------------------------------------------------------------------------
-- Pays / villes
-- ---------------------------------------------------------------------------
create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency text not null check (currency in ('XOF', 'XAF')),
  dial_code text not null check (dial_code ~ '^\+\d{1,4}$'),
  google_region text not null,
  active boolean not null default false
);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  name text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  center extensions.geography(Point, 4326) generated always as (public.make_point(center_lat, center_lng)) stored,
  pricing jsonb not null,
  merchant_momo_number text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Zones (polygones PostGIS, dessinés dans l'admin)
-- ---------------------------------------------------------------------------
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  code text not null unique,
  name text not null,
  color text not null default '#2F80ED' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  area extensions.geography(MultiPolygon, 4326) not null,
  active boolean not null default true,
  allow_overflow boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index zones_area_gix on public.zones using gist (area);
create index zones_city_idx on public.zones (city_id);

create table public.zone_neighborhoods (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  name text not null,
  unique (zone_id, name)
);

-- Rattache un point à une zone active de la ville. Frontière commune → plus petit code.
create or replace function public.zone_of(p_city_id uuid, p_point extensions.geography)
returns uuid
language sql stable
set search_path = public, extensions
as $$
  select z.id
  from public.zones z
  where z.city_id = p_city_id and z.active and extensions.st_covers(z.area, p_point)
  order by z.code
  limit 1;
$$;

create or replace function public.zone_of_latlng(p_city_id uuid, p_lat double precision, p_lng double precision)
returns uuid
language sql stable
set search_path = public, extensions
as $$
  select public.zone_of(p_city_id, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography);
$$;

-- Zones au format GeoJSON pour les apps et l'admin.
create or replace view public.zones_geojson
with (security_invoker = true) as
select z.id, z.city_id, z.code, z.name, z.color, z.active, z.allow_overflow,
       extensions.st_asgeojson(z.area::extensions.geometry, 6)::jsonb as geojson,
       array(select n.name from public.zone_neighborhoods n where n.zone_id = z.id order by n.name) as neighborhoods
from public.zones z;

