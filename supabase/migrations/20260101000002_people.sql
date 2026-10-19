-- Koursa — 2. Profils, coursiers, portefeuilles, jetons push

create type public.user_role as enum ('client', 'courier', 'admin');
create type public.courier_validation as enum ('pending', 'validated', 'suspended', 'rejected');
create type public.wallet_tx_type as enum ('commission', 'incentive', 'waiting', 'penalty', 'repayment', 'adjustment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'client',
  full_name text,
  phone text,
  city_id uuid references public.cities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Création automatique du profil à l'inscription (rôle client par défaut, jamais admin).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone, city_id)
  values (
    new.id,
    'client',
    nullif(new.raw_user_meta_data->>'full_name', ''),
    case when new.phone is null or new.phone = '' then null
         when left(new.phone, 1) = '+' then new.phone else '+' || new.phone end,
    (select id from public.cities where active order by created_at limit 1)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.couriers (
  id uuid primary key references public.profiles(id) on delete cascade,
  city_id uuid not null references public.cities(id),
  validation_status public.courier_validation not null default 'pending',
  vehicle_model text,
  plate text,
  photo_path text,
  id_document_path text,
  vehicle_photo_path text,
  license_path text,
  home_zone_id uuid references public.zones(id),
  online boolean not null default false,
  position extensions.geography(Point, 4326),
  current_zone_id uuid references public.zones(id),
  last_seen_at timestamptz,
  rating_avg numeric(3, 2),
  rating_count integer not null default 0,
  blocked boolean not null default false,
  admin_note text,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index couriers_position_gix on public.couriers using gist (position);
create index couriers_available_idx on public.couriers (city_id, online, validation_status, blocked);

create table public.courier_wallets (
  courier_id uuid primary key references public.couriers(id) on delete cascade,
  -- Montant dû à la plateforme (positif = le coursier doit de l'argent).
  balance_due integer not null default 0,
  currency text not null check (currency in ('XOF', 'XAF')),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers(id) on delete cascade,
  type public.wallet_tx_type not null,
  -- Signé : + augmente la dette (commission, pénalité), − la réduit (incitation, remboursement).
  amount integer not null,
  currency text not null check (currency in ('XOF', 'XAF')),
  delivery_id uuid,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index wallet_tx_courier_idx on public.wallet_transactions (courier_id, created_at desc);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app text not null check (app in ('client', 'courier')),
  kind text not null check (kind in ('expo', 'webpush')),
  token text not null,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
