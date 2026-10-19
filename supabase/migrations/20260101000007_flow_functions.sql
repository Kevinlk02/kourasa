-- Koursa — 7. Déroulé de la course (coursier, client, destinataire). Toutes les
-- transitions sont atomiques (SELECT … FOR UPDATE) et journalisées dans delivery_events.

-- ---------------------------------------------------------------------------
-- Coursier : inscription, présence, position
-- ---------------------------------------------------------------------------
create or replace function public.courier_apply(
  p_full_name text, p_vehicle_model text, p_plate text,
  p_photo_path text, p_id_document_path text, p_vehicle_photo_path text, p_license_path text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_city uuid;
  v_currency text;
begin
  if v_uid is null then raise exception 'Non connecté' using errcode = '42501'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 or length(trim(coalesce(p_plate, ''))) < 3 then
    raise exception 'Informations incomplètes' using errcode = 'P0001';
  end if;
  select coalesce(p.city_id, (select id from public.cities where active order by created_at limit 1))
    into v_city from public.profiles p where p.id = v_uid;
  select co.currency into v_currency from public.cities ci join public.countries co on co.code = ci.country_code where ci.id = v_city;

  update public.profiles set full_name = trim(p_full_name),
    role = case when role = 'admin' then role else 'courier' end, updated_at = now()
  where id = v_uid;

  insert into public.couriers (id, city_id, vehicle_model, plate, photo_path, id_document_path, vehicle_photo_path, license_path)
  values (v_uid, v_city, trim(p_vehicle_model), upper(trim(p_plate)), p_photo_path, p_id_document_path, p_vehicle_photo_path, p_license_path)
  on conflict (id) do update set
    vehicle_model = excluded.vehicle_model, plate = excluded.plate, photo_path = excluded.photo_path,
    id_document_path = excluded.id_document_path, vehicle_photo_path = excluded.vehicle_photo_path,
    license_path = excluded.license_path,
    validation_status = case when public.couriers.validation_status = 'rejected' then 'pending' else public.couriers.validation_status end,
    updated_at = now();

  insert into public.courier_wallets (courier_id, currency) values (v_uid, v_currency) on conflict do nothing;
end;
$$;

create or replace function public.courier_set_online(p_online boolean, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.couriers%rowtype;
begin
  select * into c from public.couriers where id = auth.uid() for update;
  if not found then raise exception 'Compte coursier introuvable' using errcode = 'P0002'; end if;
  if p_online and c.validation_status <> 'validated' then raise exception 'Compte non validé' using errcode = 'P0001'; end if;
  if p_online and c.blocked then raise exception 'Compte bloqué : commission due' using errcode = 'P0001'; end if;
  update public.couriers set
    online = p_online,
    position = case when p_lat is not null then public.make_point(p_lat, p_lng) else position end,
    current_zone_id = case when p_lat is not null then public.zone_of_latlng(city_id, p_lat, p_lng) else current_zone_id end,
    last_seen_at = case when p_lat is not null then now() else last_seen_at end,
    updated_at = now()
  where id = c.id returning * into c;
  return jsonb_build_object('online', c.online, 'current_zone_id', c.current_zone_id,
    'in_home_zone', c.current_zone_id is not distinct from c.home_zone_id);
end;
$$;

-- Lot de positions (file d'attente locale envoyée au retour du réseau).
create or replace function public.courier_ping(p_points jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.couriers%rowtype;
  v_active uuid;
  v_last jsonb;
  v_pt jsonb;
begin
  select * into c from public.couriers where id = auth.uid();
  if not found then raise exception 'Compte coursier introuvable' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) = 0 then
    return jsonb_build_object('ok', false);
  end if;
  select value into v_last from jsonb_array_elements(p_points) order by (value->>'recorded_at')::timestamptz desc limit 1;

  select id into v_active from public.deliveries
   where courier_id = c.id and status in ('assigned', 'picked_up', 'delivering') limit 1;

  if v_active is not null then
    for v_pt in select value from jsonb_array_elements(p_points) limit 200 loop
      insert into public.courier_locations (courier_id, delivery_id, point, lat, lng, heading, speed, recorded_at)
      values (c.id, v_active, public.make_point((v_pt->>'lat')::float8, (v_pt->>'lng')::float8),
              (v_pt->>'lat')::float8, (v_pt->>'lng')::float8, (v_pt->>'heading')::real, (v_pt->>'speed')::real,
              least((v_pt->>'recorded_at')::timestamptz, now()));
    end loop;
  end if;

  update public.couriers set
    position = public.make_point((v_last->>'lat')::float8, (v_last->>'lng')::float8),
    current_zone_id = public.zone_of_latlng(city_id, (v_last->>'lat')::float8, (v_last->>'lng')::float8),
    last_seen_at = least((v_last->>'recorded_at')::timestamptz, now()),
    updated_at = now()
  where id = c.id returning * into c;

  return jsonb_build_object('ok', true, 'current_zone_id', c.current_zone_id,
    'in_home_zone', c.current_zone_id is not distinct from c.home_zone_id, 'active_delivery_id', v_active);
end;
$$;

-- ---------------------------------------------------------------------------
-- Coursier : étapes de la course
-- ---------------------------------------------------------------------------

-- « Je suis arrivé » : validé serveur, GPS à moins de 100 m. Démarre le minuteur d'attente.
create or replace function public.courier_arrive(p_delivery uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  d public.deliveries%rowtype;
  pv public.delivery_private%rowtype;
  p jsonb;
  v_here extensions.geography := public.make_point(p_lat, p_lng);
  v_stop text;
  v_target extensions.geography;
  v_dist integer;
begin
  select * into d from public.deliveries where id = p_delivery and courier_id = auth.uid() for update;
  if not found then raise exception 'Course introuvable' using errcode = 'P0002'; end if;
  select * into pv from public.delivery_private where delivery_id = p_delivery;
  p := public.city_pricing(d.city_id);

  if d.status = 'assigned' and d.arrived_pickup_at is null then
    v_stop := 'pickup'; v_target := d.pickup_point;
  elsif d.status in ('picked_up', 'delivering') and d.arrived_dropoff_at is null then
    v_stop := 'dropoff'; v_target := d.dropoff_point;
  else
    raise exception 'Étape invalide' using errcode = 'P0001';
  end if;

  v_dist := round(extensions.st_distance(v_here, v_target));
  if v_dist > (p->>'arrival_radius_m')::integer then
    perform public.log_event(p_delivery, d.status, d.status, 'arrive_rejected', auth.uid(), jsonb_build_object('stop', v_stop, 'distance_m', v_dist));
    raise exception 'Vous êtes à % m du point (maximum % m)', v_dist, (p->>'arrival_radius_m')::integer using errcode = 'P0003';
  end if;

  if v_stop = 'pickup' then
    update public.deliveries set arrived_pickup_at = now(), updated_at = now() where id = p_delivery;
  else
    update public.deliveries set arrived_dropoff_at = now(), status = 'delivering',
      delivering_at = coalesce(delivering_at, now()), updated_at = now() where id = p_delivery;
  end if;
  update public.couriers set position = v_here, last_seen_at = now() where id = auth.uid();
  perform public.log_event(p_delivery, d.status, d.status, 'arrived_' || v_stop, auth.uid(), jsonb_build_object('distance_m', v_dist));

  return jsonb_build_object('stop', v_stop, 'arrived_at', now(),
    'grace_min', case when v_stop = 'pickup' then pv.pickup_grace_min else pv.dropoff_grace_min end,
    'is_restaurant', v_stop = 'pickup' and pv.pickup_is_restaurant);
end;
$$;

create or replace function public.record_waiting(p_delivery uuid, p_stop text, p_arrived timestamptz, p_fee integer)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venue uuid;
  v_place text;
  v_waited integer := greatest(0, extract(epoch from (now() - p_arrived))::integer);
begin
  if p_stop = 'pickup' then
    select pv.pickup_venue_id, d.pickup_place_id into v_venue, v_place
    from public.deliveries d join public.delivery_private pv on pv.delivery_id = d.id where d.id = p_delivery;
  else
    select dropoff_place_id into v_place from public.deliveries where id = p_delivery;
  end if;
  insert into public.waiting_logs (delivery_id, stop, venue_id, place_id, waited_s, fee)
  values (p_delivery, p_stop, v_venue, v_place, v_waited, p_fee);
  if v_venue is not null then
    update public.venues set
      avg_wait_s = round((coalesce(avg_wait_s, 0) * wait_samples + v_waited)::numeric / (wait_samples + 1)),
      wait_samples = wait_samples + 1
    where id = v_venue;
  end if;
end;
$$;

-- Colis récupéré : fige l'attente à la récupération (payée par l'expéditeur).
create or replace function public.courier_picked_up(p_delivery uuid, p_photo_path text default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  pv public.delivery_private%rowtype;
  v_fee integer;
begin
  select * into d from public.deliveries where id = p_delivery and courier_id = auth.uid() for update;
  if not found then raise exception 'Course introuvable' using errcode = 'P0002'; end if;
  if d.status <> 'assigned' or d.arrived_pickup_at is null then
    raise exception 'Indiquez d''abord que vous êtes arrivé' using errcode = 'P0001';
  end if;
  select * into pv from public.delivery_private where delivery_id = p_delivery;
  v_fee := public.waiting_fee(public.city_pricing(d.city_id), pv.pickup_grace_min, d.arrived_pickup_at, now());

  update public.deliveries set status = 'picked_up', picked_up_at = now(), waiting_pickup_fee = v_fee,
    amount_collected_pickup = case when payer = 'sender' then price_locked + v_fee else 0 end,
    updated_at = now()
  where id = p_delivery;
  perform public.record_waiting(p_delivery, 'pickup', d.arrived_pickup_at, v_fee);
  perform public.log_event(p_delivery, 'assigned', 'picked_up', 'picked_up', auth.uid(),
    jsonb_build_object('waiting_fee', v_fee, 'photo_path', p_photo_path));
  return jsonb_build_object('waiting_pickup_fee', v_fee,
    'collect_now', case when d.payer = 'sender' then d.price_locked + v_fee else 0 end);
end;
$$;

create or replace function public.courier_start_dropoff(p_delivery uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
begin
  select * into d from public.deliveries where id = p_delivery and courier_id = auth.uid() for update;
  if not found or d.status <> 'picked_up' then raise exception 'Étape invalide' using errcode = 'P0001'; end if;
  update public.deliveries set status = 'delivering', delivering_at = now(), updated_at = now() where id = p_delivery;
  perform public.log_event(p_delivery, 'picked_up', 'delivering', 'delivering', auth.uid(), '{}'::jsonb);
end;
$$;

-- Montant à encaisser maintenant (affiché en grand au coursier avant la saisie du code).
create or replace function public.collect_preview(p_delivery uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  pv public.delivery_private%rowtype;
  v_drop integer;
begin
  select * into d from public.deliveries where id = p_delivery
    and (courier_id = auth.uid() or public.is_admin());
  if not found then raise exception 'Course introuvable' using errcode = 'P0002'; end if;
  select * into pv from public.delivery_private where delivery_id = p_delivery;
  v_drop := public.waiting_fee(public.city_pricing(d.city_id), pv.dropoff_grace_min, d.arrived_dropoff_at, now());
  return jsonb_build_object(
    'payer', d.payer, 'currency', d.currency,
    'price', d.price_locked,
    'waiting_pickup_fee', d.waiting_pickup_fee,
    'waiting_dropoff_fee', v_drop,
    'at_dropoff', case when d.payer = 'recipient' then d.price_locked + d.waiting_pickup_fee + v_drop else v_drop end,
    'price_paid_at_pickup', d.payer = 'sender'
  );
end;
$$;

-- Livraison : code à 4 chiffres, encaissement, commission, pénalité éventuelle.
create or replace function public.courier_complete(p_delivery uuid, p_code text, p_waiting_refused boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  d public.deliveries%rowtype;
  pv public.delivery_private%rowtype;
  p jsonb;
  v_rate numeric;
  v_drop_fee integer;
  v_drop_collected integer;
  v_at_dropoff integer;
  v_total integer;
  v_commission integer;
  v_penalty integer := 0;
  v_penalty_status text := null;
  v_incident public.incident_status;
  v_failed integer;
begin
  select * into d from public.deliveries where id = p_delivery and courier_id = auth.uid() for update;
  if not found then raise exception 'Course introuvable' using errcode = 'P0002'; end if;
  if d.status not in ('picked_up', 'delivering') or d.arrived_dropoff_at is null then
    raise exception 'Indiquez d''abord que vous êtes arrivé' using errcode = 'P0001';
  end if;
  select * into pv from public.delivery_private where delivery_id = p_delivery for update;
  p := public.city_pricing(d.city_id);

  select count(*) into v_failed from public.delivery_events
   where delivery_id = p_delivery and kind = 'code_failed' and created_at > now() - interval '15 minutes';
  if v_failed >= 5 then raise exception 'Trop d''essais. Réessayez dans 15 minutes.' using errcode = 'P0001'; end if;
  if p_code is null or pv.code_hash <> extensions.crypt(p_code, pv.code_hash) then
    perform public.log_event(p_delivery, d.status, d.status, 'code_failed', auth.uid(), '{}'::jsonb);
    raise exception 'Code incorrect' using errcode = 'P0004';
  end if;

  v_rate := (p->>'margin_rate')::numeric;
  v_drop_fee := public.waiting_fee(p, pv.dropoff_grace_min, d.arrived_dropoff_at, now());
  v_drop_collected := case when p_waiting_refused then 0 else v_drop_fee end;
  v_at_dropoff := case when d.payer = 'recipient' then d.price_locked + d.waiting_pickup_fee + v_drop_collected else v_drop_collected end;
  v_total := coalesce(d.amount_collected_pickup, 0) + v_at_dropoff;
  -- 18 % du prix ET des frais d'attente encaissés.
  v_commission := round(d.price_locked * v_rate)::integer + round((d.waiting_pickup_fee + v_drop_collected) * v_rate)::integer;

  -- Pénalité de retard (l'attente du destinataire ne compte pas : on mesure jusqu'à l'arrivée).
  v_penalty := public.late_penalty_amount(p, d.duration_s, d.picked_up_at, d.arrived_dropoff_at, pv.courier_share);
  if v_penalty > 0 then
    select status into v_incident from public.incidents
     where delivery_id = p_delivery and kind in ('breakdown', 'accident', 'police_check', 'other')
     order by (status = 'validated') desc, created_at desc limit 1;
    if v_incident = 'validated' then v_penalty_status := 'waived';
    elsif v_incident = 'open' then v_penalty_status := 'pending_review';
    else v_penalty_status := 'applied';
    end if;
  end if;

  update public.deliveries set status = 'delivered', delivered_at = now(),
    waiting_dropoff_fee = v_drop_fee, waiting_refused = p_waiting_refused,
    amount_collected_dropoff = v_at_dropoff, total_collected = v_total, updated_at = now()
  where id = p_delivery;
  update public.delivery_private set commission = v_commission,
    late_penalty = case when v_penalty > 0 then v_penalty end, late_penalty_status = v_penalty_status
  where delivery_id = p_delivery;

  perform public.wallet_apply(auth.uid(), 'commission', v_commission, p_delivery, 'Commission course + attente', null);
  if v_penalty_status = 'applied' then
    perform public.wallet_apply(auth.uid(), 'penalty', v_penalty, p_delivery, 'Pénalité de retard', null);
  end if;
  perform public.record_waiting(p_delivery, 'dropoff', d.arrived_dropoff_at, v_drop_fee);

  if p_waiting_refused and v_drop_fee > 0 then
    insert into public.incidents (courier_id, delivery_id, kind, description)
    values (auth.uid(), p_delivery, 'waiting_refused', format('Frais d''attente refusés par le destinataire : %s', v_drop_fee));
  end if;

  perform public.log_event(p_delivery, d.status, 'delivered', 'delivered', auth.uid(), jsonb_build_object(
    'at_dropoff', v_at_dropoff, 'total_collected', v_total, 'commission', v_commission,
    'waiting_dropoff_fee', v_drop_fee, 'waiting_refused', p_waiting_refused,
    'late_penalty', v_penalty, 'late_penalty_status', v_penalty_status));

  return jsonb_build_object('status', 'delivered', 'at_dropoff', v_at_dropoff, 'total_collected', v_total,
    'price', d.price_locked, 'waiting_pickup_fee', d.waiting_pickup_fee, 'waiting_dropoff_fee', v_drop_fee,
    'waiting_refused', p_waiting_refused, 'commission', v_commission, 'currency', d.currency);
end;
$$;

-- « Client absent » : seulement après le plafond d'attente.
create or replace function public.courier_client_absent(p_delivery uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  pv public.delivery_private%rowtype;
  p jsonb;
  v_fee integer;
begin
  select * into d from public.deliveries where id = p_delivery and courier_id = auth.uid() for update;
  if not found then raise exception 'Course introuvable' using errcode = 'P0002'; end if;
  select * into pv from public.delivery_private where delivery_id = p_delivery;
  p := public.city_pricing(d.city_id);

  if d.status = 'assigned' and d.arrived_pickup_at is not null then
    if not public.waiting_cap_reached(p, pv.pickup_grace_min, d.arrived_pickup_at, now()) then
      raise exception 'Attendez la fin du temps d''attente' using errcode = 'P0001';
    end if;
    v_fee := public.waiting_fee(p, pv.pickup_grace_min, d.arrived_pickup_at, now());
    update public.deliveries set status = 'cancelled_by_client', cancelled_at = now(), cancel_reason = 'client_absent',
      waiting_pickup_fee = v_fee, updated_at = now() where id = p_delivery;
    perform public.record_waiting(p_delivery, 'pickup', d.arrived_pickup_at, v_fee);
    insert into public.incidents (courier_id, delivery_id, kind, description)
    values (auth.uid(), p_delivery, 'client_absent', format('Expéditeur absent. Frais d''annulation (attente) : %s', v_fee));
    perform public.log_event(p_delivery, d.status, 'cancelled_by_client', 'client_absent_pickup', auth.uid(), jsonb_build_object('fee', v_fee));
    return jsonb_build_object('status', 'cancelled_by_client', 'fee', v_fee);
  elsif d.status in ('picked_up', 'delivering') and d.arrived_dropoff_at is not null then
    if not public.waiting_cap_reached(p, pv.dropoff_grace_min, d.arrived_dropoff_at, now()) then
      raise exception 'Attendez la fin du temps d''attente' using errcode = 'P0001';
    end if;
    v_fee := public.waiting_fee(p, pv.dropoff_grace_min, d.arrived_dropoff_at, now());
    update public.deliveries set status = 'failed', cancel_reason = 'recipient_absent',
      waiting_dropoff_fee = v_fee, updated_at = now() where id = p_delivery;
    perform public.record_waiting(p_delivery, 'dropoff', d.arrived_dropoff_at, v_fee);
    insert into public.incidents (courier_id, delivery_id, kind, description)
    values (auth.uid(), p_delivery, 'client_absent', 'Destinataire injoignable : retour à l''expéditeur avec frais de retour');
    perform public.log_event(p_delivery, d.status, 'failed', 'recipient_absent', auth.uid(), jsonb_build_object('fee', v_fee));
    return jsonb_build_object('status', 'failed', 'fee', v_fee);
  end if;
  raise exception 'Étape invalide' using errcode = 'P0001';
end;
$$;

-- Le coursier se désiste avant la récupération : la course repart en recherche.
create or replace function public.courier_cancel(p_delivery uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
begin
  select * into d from public.deliveries where id = p_delivery and courier_id = auth.uid() for update;
  if not found or d.status <> 'assigned' then raise exception 'Annulation impossible à cette étape' using errcode = 'P0001'; end if;
  update public.deliveries set status = 'searching', courier_id = null, assigned_at = null, arrived_pickup_at = null,
    search_started_at = now(), updated_at = now() where id = p_delivery;
  update public.delivery_private set wave = 1, wave_started_at = now(), approach_m = null, approach_bonus = null
   where delivery_id = p_delivery;
  update public.delivery_offers set response = 'declined' where delivery_id = p_delivery and courier_id = auth.uid();
  perform public.log_event(p_delivery, 'assigned', 'searching', 'cancelled_by_courier', auth.uid(), jsonb_build_object('reason', p_reason));
  perform public.dispatch_tick(p_delivery);
end;
$$;

create or replace function public.report_incident(p_delivery uuid, p_kind text, p_description text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_kind not in ('breakdown', 'accident', 'police_check', 'other') then
    raise exception 'Type d''incident invalide' using errcode = 'P0001';
  end if;
  if p_delivery is not null and not exists (select 1 from public.deliveries where id = p_delivery and courier_id = auth.uid()) then
    raise exception 'Course introuvable' using errcode = 'P0002';
  end if;
  insert into public.incidents (courier_id, delivery_id, kind, description)
  values (auth.uid(), p_delivery, p_kind, coalesce(left(p_description, 500), '')) returning id into v_id;
  if p_delivery is not null then
    perform public.log_event(p_delivery, null, null, 'incident', auth.uid(), jsonb_build_object('kind', p_kind));
  end if;
  return v_id;
end;
$$;

-- Le coursier signale qu'un lieu est un restaurant (validé ensuite par l'admin).
create or replace function public.report_venue(p_lat double precision, p_lng double precision, p_name text, p_place_id text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_city uuid;
begin
  select city_id into v_city from public.couriers where id = auth.uid();
  if v_city is null then raise exception 'Réservé aux coursiers' using errcode = '42501'; end if;
  insert into public.venues (city_id, place_id, point, name, source, validated, reported_by)
  values (v_city, nullif(p_place_id, ''), public.make_point(p_lat, p_lng), left(coalesce(nullif(trim(p_name), ''), 'Restaurant'), 120), 'courier', false, auth.uid())
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Course en cours du coursier (avec la vraie règle d'attente).
create or replace function public.courier_current_delivery()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(x) from (
    select d.id, d.status, d.currency,
      public.lat_of(d.pickup_point) as pickup_lat, public.lng_of(d.pickup_point) as pickup_lng,
      d.pickup_address, d.pickup_landmark, pv.pickup_is_restaurant, pv.pickup_grace_min,
      public.lat_of(d.dropoff_point) as dropoff_lat, public.lng_of(d.dropoff_point) as dropoff_lng,
      d.dropoff_address, d.dropoff_landmark, pv.dropoff_grace_min,
      d.recipient_name, d.recipient_phone, pr.full_name as sender_name, pr.phone as sender_phone,
      d.size, d.payer, d.note, d.distance_m, d.price_locked, pv.courier_share,
      d.arrived_pickup_at, d.picked_up_at, d.arrived_dropoff_at,
      d.waiting_pickup_fee, d.waiting_dropoff_fee, d.amount_collected_pickup,
      (select (ci.pricing->'waiting') from public.cities ci where ci.id = d.city_id) as waiting_rule
    from public.deliveries d
    join public.delivery_private pv on pv.delivery_id = d.id
    join public.profiles pr on pr.id = d.client_id
    where d.courier_id = auth.uid() and d.status in ('assigned', 'picked_up', 'delivering')
    order by d.assigned_at desc limit 1
  ) x;
$$;

-- Gains du coursier sur une période.
create or replace function public.courier_earnings(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with d as (
    select dl.*, pv.commission, pv.courier_share
    from public.deliveries dl join public.delivery_private pv on pv.delivery_id = dl.id
    where dl.courier_id = auth.uid() and dl.status = 'delivered' and dl.delivered_at >= p_from and dl.delivered_at < p_to
  ), tx as (
    select type, sum(amount)::integer as total from public.wallet_transactions
    where courier_id = auth.uid() and created_at >= p_from and created_at < p_to group by type
  )
  select jsonb_build_object(
    'deliveries', (select count(*) from d),
    'gross_collected', coalesce((select sum(total_collected) from d), 0),
    'courses_share', coalesce((select sum(courier_share) from d), 0),
    'waiting_share', coalesce((select sum((waiting_pickup_fee + case when waiting_refused then 0 else waiting_dropoff_fee end)
       - round((waiting_pickup_fee + case when waiting_refused then 0 else waiting_dropoff_fee end) * (select (pricing->>'margin_rate')::numeric from public.cities where id = d.city_id)))::integer from d), 0),
    'incentives', coalesce(-(select total from tx where type = 'incentive'), 0),
    'penalties', coalesce((select total from tx where type = 'penalty'), 0),
    'commission', coalesce((select total from tx where type = 'commission'), 0),
    'balance_due', coalesce((select balance_due from public.courier_wallets where courier_id = auth.uid()), 0),
    'block_threshold', (select (ci.pricing->>'block_threshold')::integer from public.couriers c join public.cities ci on ci.id = c.city_id where c.id = auth.uid()),
    'merchant_momo_number', (select ci.merchant_momo_number from public.couriers c join public.cities ci on ci.id = c.city_id where c.id = auth.uid()),
    'currency', (select currency from public.courier_wallets where courier_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Client
-- ---------------------------------------------------------------------------
create or replace function public.client_cancel(p_delivery uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
begin
  select * into d from public.deliveries where id = p_delivery and client_id = auth.uid() for update;
  if not found then raise exception 'Course introuvable' using errcode = 'P0002'; end if;
  -- Gratuit tant que personne n'a accepté ; ensuite il faut contacter le coursier / le support.
  if d.status not in ('pending', 'searching', 'unassigned') then
    raise exception 'Un coursier a déjà accepté : appelez-le pour annuler' using errcode = 'P0001';
  end if;
  update public.deliveries set status = 'cancelled_by_client', cancelled_at = now(), cancel_reason = 'client', updated_at = now()
  where id = p_delivery;
  update public.delivery_offers set response = 'expired', responded_at = now() where delivery_id = p_delivery and response = 'pending';
  perform public.log_event(p_delivery, d.status, 'cancelled_by_client', 'cancelled_by_client', auth.uid(), '{}'::jsonb);
end;
$$;

create or replace function public.client_retry(p_delivery uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.deliveries where id = p_delivery and client_id = auth.uid() and status = 'unassigned') then
    raise exception 'Course introuvable' using errcode = 'P0002';
  end if;
  delete from public.delivery_offers where delivery_id = p_delivery and response <> 'accepted';
  return public.start_search(p_delivery);
end;
$$;

-- Frais d'attente vus par le client : seulement quand ils ont commencé (la tolérance restaurant reste interne).
create or replace function public.client_waiting(p_delivery uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  pv public.delivery_private%rowtype;
  p jsonb;
  v_arrived timestamptz;
  v_grace integer;
  v_stop text;
  v_fee integer;
begin
  select * into d from public.deliveries where id = p_delivery and client_id = auth.uid();
  if not found then raise exception 'Course introuvable' using errcode = 'P0002'; end if;
  select * into pv from public.delivery_private where delivery_id = p_delivery;
  p := public.city_pricing(d.city_id);
  if d.status = 'assigned' and d.arrived_pickup_at is not null then
    v_stop := 'pickup'; v_arrived := d.arrived_pickup_at; v_grace := pv.pickup_grace_min;
  elsif d.status in ('picked_up', 'delivering') and d.arrived_dropoff_at is not null then
    v_stop := 'dropoff'; v_arrived := d.arrived_dropoff_at; v_grace := pv.dropoff_grace_min;
  else
    return jsonb_build_object('stop', null, 'charging', false, 'fee', 0);
  end if;
  v_fee := public.waiting_fee(p, v_grace, v_arrived, now());
  if now() < v_arrived + make_interval(mins => v_grace) then
    return jsonb_build_object('stop', v_stop, 'arrived', true, 'charging', false, 'fee', 0);
  end if;
  return jsonb_build_object('stop', v_stop, 'arrived', true, 'charging', true, 'fee', v_fee,
    'charging_since', v_arrived + make_interval(mins => v_grace),
    'fee_per_min', (p->'waiting'->>'fee_per_min')::integer,
    'max_fee', (p->'waiting'->>'fee_per_min')::integer * (p->'waiting'->>'max_billable_min')::integer);
end;
$$;

create or replace function public.delivery_courier_info(p_delivery uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', pr.full_name, 'phone', pr.phone, 'plate', c.plate, 'vehicle_model', c.vehicle_model,
    'photo_path', c.photo_path, 'rating_avg', c.rating_avg,
    'lat', public.lat_of(c.position), 'lng', public.lng_of(c.position))
  from public.deliveries d
  join public.couriers c on c.id = d.courier_id
  join public.profiles pr on pr.id = c.id
  where d.id = p_delivery and (d.client_id = auth.uid() or public.is_admin());
$$;

create or replace function public.rate_delivery(p_delivery uuid, p_stars integer, p_comment text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
begin
  select * into d from public.deliveries where id = p_delivery and client_id = auth.uid();
  if not found or d.status <> 'delivered' or d.courier_id is null then
    raise exception 'Course non notable' using errcode = 'P0001';
  end if;
  if p_stars not between 1 and 5 then raise exception 'Note invalide' using errcode = 'P0001'; end if;
  insert into public.ratings (delivery_id, client_id, courier_id, stars, comment)
  values (p_delivery, auth.uid(), d.courier_id, p_stars, left(p_comment, 500));
  update public.couriers c set
    rating_count = s.n, rating_avg = s.avg
  from (select count(*)::integer as n, round(avg(stars)::numeric, 2) as avg from public.ratings where courier_id = d.courier_id) s
  where c.id = d.courier_id;
end;
$$;

-- Historique client (sans aucune donnée interne).
create or replace function public.client_history(p_limit integer default 50, p_offset integer default 0)
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', d.id, 'status', d.status, 'created_at', d.created_at, 'delivered_at', d.delivered_at,
    'pickup_address', d.pickup_address, 'pickup_landmark', d.pickup_landmark,
    'dropoff_address', d.dropoff_address, 'dropoff_landmark', d.dropoff_landmark,
    'recipient_name', d.recipient_name, 'price_locked', d.price_locked, 'currency', d.currency,
    'waiting_pickup_fee', d.waiting_pickup_fee, 'waiting_dropoff_fee', d.waiting_dropoff_fee,
    'rated', exists (select 1 from public.ratings r where r.delivery_id = d.id),
    'courier_name', (select full_name from public.profiles where id = d.courier_id))
  from public.deliveries d
  where d.client_id = auth.uid()
  order by d.created_at desc
  limit least(p_limit, 100) offset p_offset;
$$;

-- ---------------------------------------------------------------------------
-- Destinataire : page publique /t/[token] (sans installation, sans le code)
-- ---------------------------------------------------------------------------
create or replace function public.track_delivery(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
  pv public.delivery_private%rowtype;
  p jsonb;
  v_drop integer := 0;
  v_charging boolean := false;
  v_courier jsonb := null;
  v_last record;
begin
  select * into d from public.deliveries where tracking_token = p_token;
  if not found then return null; end if;
  select * into pv from public.delivery_private where delivery_id = d.id;
  p := public.city_pricing(d.city_id);

  if d.status in ('picked_up', 'delivering') and d.arrived_dropoff_at is not null then
    v_drop := public.waiting_fee(p, pv.dropoff_grace_min, d.arrived_dropoff_at, now());
    v_charging := now() >= d.arrived_dropoff_at + make_interval(mins => pv.dropoff_grace_min);
  elsif d.status = 'delivered' then
    v_drop := case when d.waiting_refused then 0 else d.waiting_dropoff_fee end;
  end if;

  if d.courier_id is not null and d.status in ('assigned', 'picked_up', 'delivering') then
    select lat, lng, recorded_at into v_last from public.courier_locations
      where delivery_id = d.id order by recorded_at desc limit 1;
    select jsonb_build_object('name', split_part(coalesce(pr.full_name, ''), ' ', 1), 'plate', c.plate,
      'phone', pr.phone, 'lat', coalesce(v_last.lat, public.lat_of(c.position)), 'lng', coalesce(v_last.lng, public.lng_of(c.position)))
      into v_courier
    from public.couriers c join public.profiles pr on pr.id = c.id where c.id = d.courier_id;
  end if;

  return jsonb_build_object(
    'status', d.status, 'currency', d.currency,
    'recipient_name', d.recipient_name,
    'dropoff_address', d.dropoff_address, 'dropoff_landmark', d.dropoff_landmark,
    'dropoff_lat', public.lat_of(d.dropoff_point), 'dropoff_lng', public.lng_of(d.dropoff_point),
    'payer', d.payer,
    'price', case when d.payer = 'recipient' then d.price_locked else null end,
    'waiting_pickup_fee', case when d.payer = 'recipient' then d.waiting_pickup_fee else null end,
    'waiting_dropoff_fee', v_drop,
    'waiting_charging', v_charging,
    'amount_to_pay', case when d.payer = 'recipient' then d.price_locked + d.waiting_pickup_fee + v_drop else v_drop end,
    'arrived_dropoff_at', d.arrived_dropoff_at,
    'delivered_at', d.delivered_at,
    'courier', v_courier
  );
end;
$$;

grant execute on function public.track_delivery(text) to anon;
