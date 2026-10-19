-- Koursa — 8. Back-office : fonctions réservées aux admins.

create or replace function public.assert_admin()
returns void language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
end;
$$;

-- Coursiers -----------------------------------------------------------------
create or replace function public.admin_set_courier(
  p_courier uuid, p_status public.courier_validation, p_home_zone uuid default null, p_note text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  update public.couriers set
    validation_status = p_status,
    home_zone_id = coalesce(p_home_zone, home_zone_id),
    admin_note = coalesce(p_note, admin_note),
    online = case when p_status = 'validated' then online else false end,
    validated_at = case when p_status = 'validated' and validated_at is null then now() else validated_at end,
    updated_at = now()
  where id = p_courier;
  if not found then raise exception 'Coursier introuvable' using errcode = 'P0002'; end if;
end;
$$;

-- Remboursement de commission (mobile money vérifié à la main) → débloque si sous le seuil.
create or replace function public.admin_record_repayment(p_courier uuid, p_amount integer, p_note text)
returns integer
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  if p_amount <= 0 then raise exception 'Montant invalide' using errcode = 'P0001'; end if;
  return public.wallet_apply(p_courier, 'repayment', -p_amount, null, p_note, auth.uid());
end;
$$;

create or replace function public.admin_wallet_adjust(p_courier uuid, p_amount integer, p_note text)
returns integer
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  if coalesce(trim(p_note), '') = '' then raise exception 'Commentaire obligatoire' using errcode = 'P0001'; end if;
  return public.wallet_apply(p_courier, 'adjustment', p_amount, null, p_note, auth.uid());
end;
$$;

-- Incidents / litiges : valider un incident annule la pénalité de retard en attente.
create or replace function public.admin_resolve_incident(p_incident uuid, p_decision public.incident_status, p_comment text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  i public.incidents%rowtype;
  pv public.delivery_private%rowtype;
begin
  perform public.assert_admin();
  if p_decision not in ('validated', 'rejected') then raise exception 'Décision invalide' using errcode = 'P0001'; end if;
  update public.incidents set status = p_decision, admin_comment = p_comment, resolved_by = auth.uid(), resolved_at = now()
  where id = p_incident returning * into i;
  if not found then raise exception 'Incident introuvable' using errcode = 'P0002'; end if;

  if i.delivery_id is not null and i.kind in ('breakdown', 'accident', 'police_check', 'other') then
    select * into pv from public.delivery_private where delivery_id = i.delivery_id for update;
    if pv.late_penalty_status = 'pending_review' then
      if p_decision = 'validated' then
        update public.delivery_private set late_penalty_status = 'waived' where delivery_id = i.delivery_id;
      else
        update public.delivery_private set late_penalty_status = 'applied' where delivery_id = i.delivery_id;
        perform public.wallet_apply(i.courier_id, 'penalty', pv.late_penalty, i.delivery_id, 'Pénalité de retard (incident rejeté)', auth.uid());
      end if;
    end if;
    perform public.log_event(i.delivery_id, null, null, 'incident_' || p_decision::text, auth.uid(), jsonb_build_object('incident_id', p_incident, 'comment', p_comment));
  end if;
end;
$$;

create or replace function public.admin_cancel_delivery(p_delivery uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  d public.deliveries%rowtype;
begin
  perform public.assert_admin();
  select * into d from public.deliveries where id = p_delivery for update;
  if not found then raise exception 'Course introuvable' using errcode = 'P0002'; end if;
  if d.status in ('delivered', 'cancelled_by_client', 'cancelled_by_courier', 'failed') then
    raise exception 'Course déjà terminée' using errcode = 'P0001';
  end if;
  update public.deliveries set status = 'cancelled_by_client', cancelled_at = now(), cancel_reason = 'admin: ' || coalesce(p_reason, ''), updated_at = now()
  where id = p_delivery;
  update public.delivery_offers set response = 'expired' where delivery_id = p_delivery and response = 'pending';
  perform public.log_event(p_delivery, d.status, 'cancelled_by_client', 'admin_cancel', auth.uid(), jsonb_build_object('reason', p_reason));
end;
$$;

-- Note de litige sur une course (remboursement manuel, commentaire).
create or replace function public.admin_delivery_note(p_delivery uuid, p_note text, p_refund integer default 0)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  perform public.log_event(p_delivery, null, null, case when p_refund > 0 then 'admin_refund' else 'admin_note' end,
    auth.uid(), jsonb_build_object('note', p_note, 'refund', p_refund));
end;
$$;

-- Zones ---------------------------------------------------------------------
create or replace function public.admin_save_zone(
  p_zone uuid, p_city uuid, p_code text, p_name text, p_color text,
  p_geojson jsonb, p_active boolean default true, p_allow_overflow boolean default true)
returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_geom extensions.geometry;
  v_id uuid;
begin
  perform public.assert_admin();
  v_geom := extensions.st_multi(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326)));
  if extensions.geometrytype(v_geom) <> 'MULTIPOLYGON' then
    v_geom := extensions.st_multi(extensions.st_collectionextract(v_geom, 3));
  end if;
  if extensions.st_isempty(v_geom) then raise exception 'Polygone invalide' using errcode = 'P0001'; end if;

  if p_zone is null then
    insert into public.zones (city_id, code, name, color, area, active, allow_overflow)
    values (p_city, upper(p_code), p_name, p_color, v_geom::extensions.geography, p_active, p_allow_overflow)
    returning id into v_id;
  else
    update public.zones set name = p_name, color = p_color, area = v_geom::extensions.geography,
      active = p_active, allow_overflow = p_allow_overflow, updated_at = now()
    where id = p_zone returning id into v_id;
  end if;
  -- Recalcule la zone actuelle des coursiers de la ville.
  update public.couriers set current_zone_id = public.zone_of(city_id, position)
  where position is not null and city_id = (select city_id from public.zones where id = v_id);
  return v_id;
end;
$$;

create or replace function public.admin_set_neighborhoods(p_zone uuid, p_names text[])
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.assert_admin();
  delete from public.zone_neighborhoods where zone_id = p_zone;
  insert into public.zone_neighborhoods (zone_id, name)
  select p_zone, trim(n) from unnest(p_names) n where trim(n) <> '' on conflict do nothing;
end;
$$;

-- Export GeoJSON (FeatureCollection) des zones d'une ville.
create or replace function public.admin_export_zones(p_city uuid)
returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(jsonb_build_object(
    'type', 'Feature',
    'properties', jsonb_build_object('code', z.code, 'name', z.name, 'color', z.color, 'active', z.active,
      'allow_overflow', z.allow_overflow,
      'neighborhoods', (select coalesce(jsonb_agg(n.name order by n.name), '[]'::jsonb) from public.zone_neighborhoods n where n.zone_id = z.id)),
    'geometry', extensions.st_asgeojson(z.area::extensions.geometry, 6)::jsonb) order by z.code), '[]'::jsonb))
  from public.zones z where z.city_id = p_city and public.is_admin();
$$;

-- Import : met à jour par code, crée les zones manquantes.
create or replace function public.admin_import_zones(p_city uuid, p_collection jsonb)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  f jsonb;
  v_id uuid;
  n integer := 0;
begin
  perform public.assert_admin();
  for f in select value from jsonb_array_elements(p_collection->'features') loop
    select id into v_id from public.zones where code = upper(f->'properties'->>'code');
    v_id := public.admin_save_zone(v_id, p_city, f->'properties'->>'code',
      coalesce(f->'properties'->>'name', f->'properties'->>'code'),
      coalesce(f->'properties'->>'color', '#2F80ED'), f->'geometry',
      coalesce((f->'properties'->>'active')::boolean, true),
      coalesce((f->'properties'->>'allow_overflow')::boolean, true));
    if jsonb_typeof(f->'properties'->'neighborhoods') = 'array' then
      perform public.admin_set_neighborhoods(v_id, array(select jsonb_array_elements_text(f->'properties'->'neighborhoods')));
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Tableau en direct par zone ----------------------------------------------
create or replace function public.admin_zone_live(p_city uuid)
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'zone_id', z.id, 'code', z.code, 'name', z.name, 'color', z.color,
    'online_home', (select count(*) from public.couriers c where c.home_zone_id = z.id and c.online and c.current_zone_id = z.id
                      and c.last_seen_at > now() - interval '2 minutes'),
    'online_present', (select count(*) from public.couriers c where c.current_zone_id = z.id and c.online
                      and c.last_seen_at > now() - interval '2 minutes'),
    'available', (select count(*) from public.couriers c where c.current_zone_id = z.id and c.online and not c.blocked
                      and c.validation_status = 'validated' and c.last_seen_at > now() - interval '2 minutes'
                      and not public.courier_is_busy(c.id)),
    'waiting_deliveries', (select count(*) from public.deliveries d where d.pickup_zone_id = z.id and d.status = 'searching'),
    'active_deliveries', (select count(*) from public.deliveries d where d.pickup_zone_id = z.id and d.status in ('assigned', 'picked_up', 'delivering')),
    'avg_assign_s_today', (select round(avg(extract(epoch from (assigned_at - search_started_at)))) from public.deliveries d
                      where d.pickup_zone_id = z.id and d.assigned_at >= date_trunc('day', now())),
    'unassigned_today', (select count(*) from public.deliveries d where d.pickup_zone_id = z.id and d.status = 'unassigned'
                      and d.created_at >= date_trunc('day', now())),
    'alert', exists (select 1 from public.deliveries d where d.pickup_zone_id = z.id and d.status = 'searching')
             and not exists (select 1 from public.couriers c where c.current_zone_id = z.id and c.online and not c.blocked
                      and c.validation_status = 'validated' and c.last_seen_at > now() - interval '2 minutes' and not public.courier_is_busy(c.id))
  )
  from public.zones z where z.city_id = p_city and public.is_admin()
  order by z.code;
$$;

-- Carte en direct : coursiers en ligne + courses en cours.
create or replace function public.admin_live_map(p_city uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'couriers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', p.full_name, 'lat', public.lat_of(c.position), 'lng', public.lng_of(c.position),
        'home_zone_id', c.home_zone_id, 'current_zone_id', c.current_zone_id, 'busy', public.courier_is_busy(c.id),
        'last_seen_at', c.last_seen_at))
      from public.couriers c join public.profiles p on p.id = c.id
      where c.city_id = p_city and c.online and c.position is not null), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'status', d.status, 'pickup_zone_id', d.pickup_zone_id,
        'pickup_lat', public.lat_of(d.pickup_point), 'pickup_lng', public.lng_of(d.pickup_point),
        'dropoff_lat', public.lat_of(d.dropoff_point), 'dropoff_lng', public.lng_of(d.dropoff_point)))
      from public.deliveries d where d.city_id = p_city and d.status in ('searching', 'assigned', 'picked_up', 'delivering')), '[]'::jsonb)
  ) end;
$$;

-- Indicateurs (MVP §8), par zone, sur une période.
create or replace function public.admin_kpis(p_city uuid, p_from timestamptz, p_to timestamptz)
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  with d as (
    select dl.*, pv.commission, pv.approach_bonus, pv.late_penalty, pv.late_penalty_status
    from public.deliveries dl join public.delivery_private pv on pv.delivery_id = dl.id
    where dl.city_id = p_city and dl.created_at >= p_from and dl.created_at < p_to
  )
  select jsonb_build_object(
    'zone_id', z.id, 'code', z.code, 'name', z.name, 'color', z.color,
    'created', count(d.id),
    'delivered', count(d.id) filter (where d.status = 'delivered'),
    'unassigned', count(d.id) filter (where d.status = 'unassigned'),
    'unassigned_rate', round(100.0 * count(d.id) filter (where d.status = 'unassigned') / nullif(count(d.id), 0), 1),
    'avg_assign_s', round(avg(extract(epoch from (d.assigned_at - d.search_started_at))) filter (where d.assigned_at is not null)),
    'avg_delivery_min', round(avg(extract(epoch from (d.delivered_at - d.created_at)) / 60) filter (where d.status = 'delivered'), 1),
    'revenue', coalesce(sum(d.total_collected) filter (where d.status = 'delivered'), 0),
    'commission', coalesce(sum(d.commission) filter (where d.status = 'delivered'), 0),
    'incentives', coalesce(sum(d.approach_bonus) filter (where d.status = 'delivered'), 0),
    'penalties', coalesce(sum(d.late_penalty) filter (where d.late_penalty_status = 'applied'), 0),
    'real_margin_pct', round(100.0 * (coalesce(sum(d.commission) filter (where d.status = 'delivered'), 0)
                                      - coalesce(sum(d.approach_bonus) filter (where d.status = 'delivered'), 0))
                       / nullif(sum(d.total_collected) filter (where d.status = 'delivered'), 0), 1),
    'waiting_fees', coalesce(sum(d.waiting_pickup_fee + case when d.waiting_refused then 0 else d.waiting_dropoff_fee end) filter (where d.status = 'delivered'), 0),
    'late_deliveries', count(d.id) filter (where coalesce(d.late_penalty, 0) > 0),
    'active_couriers', count(distinct d.courier_id) filter (where d.status = 'delivered')
  )
  from public.zones z left join d on d.pickup_zone_id = z.id
  where z.city_id = p_city and public.is_admin()
  group by z.id, z.code, z.name, z.color
  order by z.code;
$$;

-- Totaux du mois : pénalités vs incitations, commissions dues vs récupérées.
create or replace function public.admin_money_summary(p_city uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when not public.is_admin() then null else jsonb_build_object(
    'penalties', coalesce(sum(t.amount) filter (where t.type = 'penalty'), 0),
    'incentives', coalesce(-sum(t.amount) filter (where t.type = 'incentive'), 0),
    'commissions', coalesce(sum(t.amount) filter (where t.type = 'commission'), 0),
    'repayments', coalesce(-sum(t.amount) filter (where t.type = 'repayment'), 0),
    'outstanding', (select coalesce(sum(w.balance_due), 0) from public.courier_wallets w join public.couriers c on c.id = w.courier_id where c.city_id = p_city),
    'blocked_couriers', (select count(*) from public.couriers where city_id = p_city and blocked)
  ) end
  from public.wallet_transactions t join public.couriers c on c.id = t.courier_id
  where c.city_id = p_city and t.created_at >= p_from and t.created_at < p_to;
$$;

create or replace function public.admin_google_calls(p_days integer default 30)
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('day', g.day, 'api', g.api, 'calls', g.calls, 'cache_hits', g.cache_hits, 'errors', g.errors)
  from (
    select date_trunc('day', created_at)::date as day, api,
      count(*) filter (where not cache_hit) as calls, count(*) filter (where cache_hit) as cache_hits,
      count(*) filter (where not ok) as errors
    from public.geo_calls_log
    where created_at >= now() - make_interval(days => p_days) and public.is_admin()
    group by 1, 2
  ) g
  order by g.day desc, g.api;
$$;

create or replace function public.admin_venue_waits(p_city uuid)
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', v.id, 'name', v.name, 'kind', v.kind, 'source', v.source, 'validated', v.validated,
    'is_restaurant', v.is_restaurant, 'place_id', v.place_id,
    'lat', public.lat_of(v.point), 'lng', public.lng_of(v.point),
    'avg_wait_min', round(v.avg_wait_s / 60.0, 1), 'samples', v.wait_samples,
    'reported_by', (select full_name from public.profiles where id = v.reported_by), 'created_at', v.created_at)
  from public.venues v where v.city_id = p_city and public.is_admin()
  order by v.validated, v.created_at desc;
$$;

create or replace function public.admin_add_venue(p_city uuid, p_name text, p_lat double precision, p_lng double precision, p_place_id text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare v_id uuid;
begin
  perform public.assert_admin();
  insert into public.venues (city_id, name, point, place_id, source, validated)
  values (p_city, p_name, public.make_point(p_lat, p_lng), nullif(p_place_id, ''), 'admin', true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Liste des courses filtrable.
create or replace function public.admin_deliveries(
  p_city uuid, p_zone uuid default null, p_status public.delivery_status default null,
  p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 100, p_offset integer default 0)
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', d.id, 'status', d.status, 'created_at', d.created_at,
    'pickup_zone', zp.name, 'pickup_zone_color', zp.color, 'dropoff_zone', zd.name,
    'pickup_address', d.pickup_address, 'pickup_landmark', d.pickup_landmark,
    'dropoff_address', d.dropoff_address, 'dropoff_landmark', d.dropoff_landmark,
    'client', pc.full_name, 'client_phone', pc.phone, 'courier', pk.full_name, 'courier_id', d.courier_id,
    'recipient_name', d.recipient_name, 'recipient_phone', d.recipient_phone,
    'size', d.size, 'payer', d.payer, 'distance_m', d.distance_m, 'price', d.price_locked, 'currency', d.currency,
    'waiting_pickup_fee', d.waiting_pickup_fee, 'waiting_dropoff_fee', d.waiting_dropoff_fee, 'waiting_refused', d.waiting_refused,
    'total_collected', d.total_collected, 'commission', pv.commission, 'approach_m', pv.approach_m,
    'approach_bonus', pv.approach_bonus, 'late_penalty', pv.late_penalty, 'late_penalty_status', pv.late_penalty_status,
    'pickup_is_restaurant', pv.pickup_is_restaurant, 'pickup_grace_min', pv.pickup_grace_min,
    'tracking_token', d.tracking_token, 'cancel_reason', d.cancel_reason,
    'events', (select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at, 'data', e.data) order by e.created_at)
               from public.delivery_events e where e.delivery_id = d.id))
  from public.deliveries d
  join public.delivery_private pv on pv.delivery_id = d.id
  join public.zones zp on zp.id = d.pickup_zone_id
  left join public.zones zd on zd.id = d.dropoff_zone_id
  join public.profiles pc on pc.id = d.client_id
  left join public.profiles pk on pk.id = d.courier_id
  where public.is_admin() and d.city_id = p_city
    and (p_zone is null or d.pickup_zone_id = p_zone)
    and (p_status is null or d.status = p_status)
    and (p_from is null or d.created_at >= p_from)
    and (p_to is null or d.created_at < p_to)
  order by d.created_at desc
  limit least(p_limit, 500) offset p_offset;
$$;

create or replace function public.admin_couriers(p_city uuid)
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', c.id, 'name', p.full_name, 'phone', p.phone, 'status', c.validation_status,
    'vehicle_model', c.vehicle_model, 'plate', c.plate, 'home_zone_id', c.home_zone_id, 'current_zone_id', c.current_zone_id,
    'online', c.online, 'last_seen_at', c.last_seen_at, 'blocked', c.blocked, 'rating_avg', c.rating_avg,
    'rating_count', c.rating_count, 'balance_due', coalesce(w.balance_due, 0), 'currency', w.currency,
    'photo_path', c.photo_path, 'id_document_path', c.id_document_path, 'vehicle_photo_path', c.vehicle_photo_path,
    'license_path', c.license_path, 'admin_note', c.admin_note, 'created_at', c.created_at,
    'deliveries', (select count(*) from public.deliveries d where d.courier_id = c.id and d.status = 'delivered'))
  from public.couriers c join public.profiles p on p.id = c.id
  left join public.courier_wallets w on w.courier_id = c.id
  where c.city_id = p_city and public.is_admin()
  order by (c.validation_status = 'pending') desc, c.created_at desc;
$$;
