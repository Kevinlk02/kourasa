-- Koursa — 4. Cache Google, journal des appels, limitation de débit, versions des apps

create table public.geo_cache (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index geo_cache_expires_idx on public.geo_cache (expires_at);

create table public.geo_calls_log (
  id bigint generated always as identity primary key,
  api text not null, -- autocomplete | place_details | reverse_geocode | nearby | routes
  user_id uuid,
  cache_hit boolean not null default false,
  ok boolean not null default true,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index geo_calls_log_day_idx on public.geo_calls_log (created_at, api);

create table public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);

-- Incrémente le compteur et renvoie true si la limite n'est pas dépassée (fenêtre d'une minute).
create or replace function public.check_rate_limit(p_user uuid, p_bucket text, p_limit integer)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  insert into public.rate_limits (user_id, bucket, window_start, count)
  values (p_user, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

create table public.app_versions (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('client', 'courier')),
  platform text not null check (platform in ('android', 'web')),
  latest_version text not null,
  min_version text not null,
  apk_url text,
  sha256 text,
  size_bytes bigint,
  changelog text,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles(id)
);
create index app_versions_latest_idx on public.app_versions (app, platform, published_at desc);

create or replace view public.app_versions_latest
with (security_invoker = true) as
select distinct on (app, platform) *
from public.app_versions
order by app, platform, published_at desc;
