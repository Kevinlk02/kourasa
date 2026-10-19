-- Koursa — 6. Fonctions métier serveur : helpers, argent, attribution par vagues.
-- Mêmes règles que packages/shared (pricing.ts, money.ts, dispatch.ts), testées en TypeScript.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.lat_of(g extensions.geography)
returns double precision language sql immutable
set search_path = public, extensions
as $$ select extensions.st_y(g::extensions.geometry) $$;

create or replace function public.lng_of(g extensions.geography)
returns double precision language sql immutable
set search_path = public, extensions
as $$ select extensions.st_x(g::extensions.geometry) $$;

create or replace function public.city_pricing(p_city_id uuid)
returns jsonb language sql stable security definer
set search_path = public
as $$ select pricing from public.cities where id = p_city_id $$;

create or replace function public.log_event(
  p_delivery uuid, p_from public.delivery_status, p_to public.delivery_status,
  p_kind text, p_actor uuid, p_data jsonb default '{}'::jsonb)
returns void language sql security definer
set search_path = public
as $$
  insert into public.delivery_events (delivery_id, from_status, to_status, kind, actor_id, data)
  values (p_delivery, p_from, p_to, p_kind, p_actor, coalesce(p_data, '{}'::jsonb));
$$;

-- Frais d'attente : minutes entières après la tolérance, plafonnées (money.ts waitingFee).
create or replace function public.waiting_fee(p jsonb, p_grace_min integer, p_arrived timestamptz, p_ended timestamptz)
returns integer language sql immutable
as $$
  select case when p_arrived is null then 0 else
    least(
      greatest(0, floor((extract(epoch from (p_ended - p_arrived)) - p_grace_min * 60) / 60)::integer),
      (p->'waiting'->>'max_billable_min')::integer
    ) * (p->'waiting'->>'fee_per_min')::integer
  end;
$$;

create or replace function public.waiting_cap_reached(p jsonb, p_grace_min integer, p_arrived timestamptz, p_now timestamptz)
returns boolean language sql immutable
as $$
  select p_arrived is not null and
    extract(epoch from (p_now - p_arrived)) >= (p_grace_min + (p->'waiting'->>'max_billable_min')::integer) * 60;
$$;

-- Incitation : 95 F/km au-delà de 2 km, plafond 500 F (money.ts approachBonus).
create or replace function public.approach_bonus(p jsonb, p_approach_m integer)
returns integer language sql immutable
as $$
  select least(
    round(greatest(0, p_approach_m / 1000.0 - (p->>'included_approach_km')::numeric) * (p->>'approach_bonus_per_km')::numeric)::integer,
    (p->>'approach_bonus_cap')::integer
  );
$$;

-- Pénalité de retard (money.ts latePenalty), hors incident.
create or replace function public.late_penalty_amount(p jsonb, p_duration_s integer, p_picked timestamptz, p_arrived timestamptz, p_courier_share integer)
returns integer language sql immutable
as $$
  with v as (
    select greatest(0, ceil(
      extract(epoch from (p_arrived - p_picked)) / 60.0
      - ((p_duration_s / 60.0) * (p->'late_penalty'->>'factor')::numeric + (p->'late_penalty'->>'extra_min')::numeric)
      - 1e-9))::integer as late_min
  )
  select case when late_min = 0 then 0 else
    least(late_min * (p->'late_penalty'->>'per_min')::integer,
          floor(p_courier_share * (p->'late_penalty'->>'cap_rate')::numeric)::integer)
  end from v;
$$;

-- Écriture dans le portefeuille + mise à jour du solde + blocage automatique.
create or replace function public.wallet_apply(
  p_courier uuid, p_type public.wallet_tx_type, p_amount integer,
  p_delivery uuid, p_note text, p_actor uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_currency text;
  v_balance integer;
  v_threshold integer;
begin
  select w.currency into v_currency from public.courier_wallets w where w.courier_id = p_courier for update;
  if v_currency is null then
    select co.currency into v_currency
    from public.couriers c join public.cities ci on ci.id = c.city_id join public.countries co on co.code = ci.country_code
    where c.id = p_courier;
    insert into public.courier_wallets (courier_id, currency) values (p_courier, v_currency) on conflict do nothing;
  end if;
  if p_amount = 0 then
    select balance_due into v_balance from public.courier_wallets where courier_id = p_courier;
    return v_balance;
  end if;
  insert into public.wallet_transactions (courier_id, type, amount, currency, delivery_id, note, created_by)
  values (p_courier, p_type, p_amount, v_currency, p_delivery, p_note, p_actor);
  update public.courier_wallets set balance_due = balance_due + p_amount, updated_at = now()
  where courier_id = p_courier returning balance_due into v_balance;

  select (ci.pricing->>'block_threshold')::integer into v_threshold
  from public.couriers c join public.cities ci on ci.id = c.city_id where c.id = p_courier;
  update public.couriers set blocked = (v_balance > v_threshold),
    online = case when v_balance > v_threshold then false else online end,
    updated_at = now()
  where id = p_courier;
  return v_balance;
end;
$$;

create or replace function public.courier_is_busy(p_courier uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.deliveries
                 where courier_id = p_courier and status in ('assigned', 'picked_up', 'delivering'));
$$;

-- ---------------------------------------------------------------------------
-- Attribution par vagues (docs/ZONES.md)
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_candidates(p_delivery uuid, p_wave integer)
returns table (courier_id uuid, distance_m integer)
language sql stable security definer
set search_path = public, extensions
as $$
  with d as (
    select dl.id, dl.city_id, dl.pickup_point, dl.pickup_zone_id, z.allow_overflow, ci.pricing as p
    from public.deliveries dl
    join public.zones z on z.id = dl.pickup_zone_id
    join public.cities ci on ci.id = dl.city_id
    where dl.id = p_delivery
  )
  select c.id, round(extensions.st_distance(c.position, d.pickup_point))::integer as distance_m
  from public.couriers c, d
  where c.city_id = d.city_id
    and c.validation_status = 'validated'
    and not c.blocked
    and c.online
    and c.position is not null
    and c.last_seen_at >= now() - make_interval(secs => (d.p->'dispatch'->>'location_max_age_s')::integer)
    and not public.courier_is_busy(c.id)
    -- jamais deux offres simultanées pour un même coursier
    and not exists (select 1 from public.delivery_offers o
                    where o.courier_id = c.id and o.response = 'pending' and o.expires_at > now())
    -- jamais deux fois la même course au même coursier
    and not exists (select 1 from public.delivery_offers o where o.delivery_id = d.id and o.courier_id = c.id)
    and case p_wave
      when 1 then c.home_zone_id = d.pickup_zone_id and c.current_zone_id = d.pickup_zone_id
      when 2 then c.current_zone_id = d.pickup_zone_id
      else d.allow_overflow
           and c.current_zone_id is distinct from d.pickup_zone_id
           and extensions.st_dwithin(c.position, d.pickup_point, (d.p->'dispatch'->>'overflow_radius_m')::double precision)
    end
  order by extensions.st_distance(c.position, d.pickup_point)
$$;

create or replace function public.dispatch_tick(p_delivery uuid)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  d public.deliveries%rowtype;
  pv public.delivery_private%rowtype;
  p jsonb;
  v_wave integer;
  v_wave_started timestamptz;
  v_cid uuid;
  v_dist integer;
  v_zone_name text;
  v_dropoff_zone_name text;
  w integer;
begin
  select * into d from public.deliveries where id = p_delivery and status = 'searching' for update skip locked;
  if not found then return 'skip'; end if;
  select * into pv from public.delivery_private where delivery_id = p_delivery for update;
  p := public.city_pricing(d.city_id);

  update public.delivery_offers set response = 'expired', responded_at = now()
  where delivery_id = p_delivery and response = 'pending' and expires_at <= now();

  if now() - d.search_started_at >= make_interval(secs => (p->'dispatch'->>'unassigned_after_s')::integer) then
    update public.deliveries set status = 'unassigned', updated_at = now() where id = p_delivery;
    update public.delivery_offers set response = 'expired', responded_at = now()
      where delivery_id = p_delivery and response = 'pending';
    perform public.log_event(p_delivery, 'searching', 'unassigned', 'unassigned', null, '{}'::jsonb);
    insert into public.admin_alerts (city_id, zone_id, kind, message, delivery_id)
    values (d.city_id, d.pickup_zone_id, 'unassigned', 'Course non attribuée après 3 min', p_delivery);
    return 'unassigned';
  end if;

  if exists (select 1 from public.delivery_offers where delivery_id = p_delivery and response = 'pending' and expires_at > now()) then
    return 'waiting';
  end if;

  v_wave := pv.wave;
  v_wave_started := coalesce(pv.wave_started_at, d.search_started_at);
  loop
    v_cid := null;
    if not (v_wave < 3 and now() - v_wave_started >= make_interval(secs => (p->'dispatch'->>'wave_timeout_s')::integer)) then
      select c.courier_id, c.distance_m into v_cid, v_dist from public.dispatch_candidates(p_delivery, v_wave) c limit 1;
    end if;
    exit when v_cid is not null or v_wave = 3;
    v_wave := v_wave + 1;
    v_wave_started := now();
  end loop;

  -- Rattrapage : coursiers des vagues 1-2 qui viennent de se connecter.
  if v_cid is null then
    foreach w in array array[1, 2] loop
      select c.courier_id, c.distance_m into v_cid, v_dist from public.dispatch_candidates(p_delivery, w) c limit 1;
      exit when v_cid is not null;
    end loop;
  end if;

  update public.delivery_private set wave = v_wave, wave_started_at = v_wave_started where delivery_id = p_delivery;

  if v_cid is null then
    if not exists (select 1 from public.admin_alerts where delivery_id = p_delivery and kind = 'zone_empty') then
      insert into public.admin_alerts (city_id, zone_id, kind, message, delivery_id)
      values (d.city_id, d.pickup_zone_id, 'zone_empty', 'Course en attente et aucun coursier disponible dans la zone', p_delivery);
    end if;
    return 'idle';
  end if;

  select name into v_zone_name from public.zones where id = d.pickup_zone_id;
  select name into v_dropoff_zone_name from public.zones where id = d.dropoff_zone_id;
  insert into public.delivery_offers (delivery_id, courier_id, wave, distance_m, expires_at, summary)
  values (
    p_delivery, v_cid, v_wave, v_dist,
    now() + make_interval(secs => (p->'dispatch'->>'offer_timeout_s')::integer),
    jsonb_build_object(
      'pickup_zone_name', v_zone_name,
      'dropoff_zone_name', v_dropoff_zone_name,
      'pickup_distance_m', v_dist,
      'trip_distance_m', d.distance_m,
      'courier_gain', pv.courier_share,
      'currency', d.currency,
      'size', d.size,
      'payer', d.payer,
      'pickup_address', d.pickup_address,
      'pickup_landmark', d.pickup_landmark,
      'dropoff_address', d.dropoff_address,
      'pickup_lat', public.lat_of(d.pickup_point),
      'pickup_lng', public.lng_of(d.pickup_point),
      'dropoff_lat', public.lat_of(d.dropoff_point),
      'dropoff_lng', public.lng_of(d.dropoff_point),
      'is_restaurant', pv.pickup_is_restaurant
    )
  );
  perform public.log_event(p_delivery, null, null, 'offer_sent', null,
    jsonb_build_object('courier_id', v_cid, 'wave', v_wave, 'distance_m', v_dist));
  return 'offered';
end;
$$;

-- Appelé toutes les 5 s par pg_cron.
create or replace function public.dispatch_all()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from public.deliveries where status = 'searching' order by search_started_at loop
    perform public.dispatch_tick(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Démarre la recherche (appelé par l'Edge Function create-delivery).
create or replace function public.start_search(p_delivery uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  update public.deliveries set status = 'searching', search_started_at = now(), updated_at = now()
  where id = p_delivery and status in ('pending', 'unassigned');
  if not found then raise exception 'Course introuvable ou déjà en cours' using errcode = 'P0001'; end if;
  update public.delivery_private set wave = 1, wave_started_at = now() where delivery_id = p_delivery;
  perform public.log_event(p_delivery, 'pending', 'searching', 'search_started', auth.uid(), '{}'::jsonb);
  return public.dispatch_tick(p_delivery);
end;
$$;

-- Acceptation atomique : une course ne peut être acceptée que par un seul coursier.
create or replace function public.accept_offer(p_offer uuid)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  o public.delivery_offers%rowtype;
  v_delivery public.deliveries%rowtype;
  v_courier public.couriers%rowtype;
begin
  select * into o from public.delivery_offers where id = p_offer for update;
  if not found or o.courier_id <> auth.uid() then
    raise exception 'Offre introuvable' using errcode = 'P0002';
  end if;
  if o.response <> 'pending' or o.expires_at <= now() then
    raise exception 'Offre expirée' using errcode = 'P0001';
  end if;
  select * into v_courier from public.couriers where id = o.courier_id;
  if v_courier.blocked or v_courier.validation_status <> 'validated' then
    raise exception 'Compte non autorisé' using errcode = 'P0001';
  end if;
  if public.courier_is_busy(o.courier_id) then
    raise exception 'Vous avez déjà une course' using errcode = 'P0001';
  end if;

  update public.deliveries
     set status = 'assigned', courier_id = o.courier_id, assigned_at = now(), updated_at = now()
   where id = o.delivery_id and status = 'searching'
  returning * into v_delivery;
  if not found then
    update public.delivery_offers set response = 'expired', responded_at = now() where id = p_offer;
    raise exception 'Course déjà prise' using errcode = 'P0001';
  end if;

  update public.delivery_offers set response = 'accepted', responded_at = now() where id = p_offer;
  update public.delivery_offers set response = 'expired', responded_at = now()
   where delivery_id = o.delivery_id and id <> p_offer and response = 'pending';
  perform public.log_event(o.delivery_id, 'searching', 'assigned', 'accepted', auth.uid(),
    jsonb_build_object('offer_id', p_offer, 'wave', o.wave));
  update public.admin_alerts set resolved = true where delivery_id = o.delivery_id and kind = 'zone_empty';

  return jsonb_build_object(
    'delivery_id', v_delivery.id,
    'courier_lat', public.lat_of(v_courier.position),
    'courier_lng', public.lng_of(v_courier.position),
    'pickup_lat', public.lat_of(v_delivery.pickup_point),
    'pickup_lng', public.lng_of(v_delivery.pickup_point),
    'straight_m', round(extensions.st_distance(v_courier.position, v_delivery.pickup_point))
  );
end;
$$;

create or replace function public.decline_offer(p_offer uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_delivery uuid;
begin
  update public.delivery_offers set response = 'declined', responded_at = now()
   where id = p_offer and courier_id = auth.uid() and response = 'pending'
  returning delivery_id into v_delivery;
  if v_delivery is not null then
    perform public.log_event(v_delivery, null, null, 'offer_declined', auth.uid(), '{}'::jsonb);
    perform public.dispatch_tick(v_delivery);
  end if;
end;
$$;

-- Distance d'approche routière (calculée par l'Edge Function accept-offer) → incitation.
create or replace function public.set_approach(p_delivery uuid, p_approach_m integer)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_bonus integer;
begin
  select public.approach_bonus(ci.pricing, p_approach_m) into v_bonus
  from public.deliveries d join public.cities ci on ci.id = d.city_id where d.id = p_delivery;
  update public.delivery_private set approach_m = p_approach_m, approach_bonus = v_bonus where delivery_id = p_delivery;
  return v_bonus;
end;
$$;

-- Hash du code de livraison (le code en clair n'est jamais stocké).
create or replace function public.hash_code(p_code text)
returns text language sql volatile
set search_path = public, extensions
as $$ select extensions.crypt(p_code, extensions.gen_salt('bf', 8)) $$;
