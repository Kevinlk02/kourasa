-- Koursa — 9. Tâches planifiées, temps réel, stockage, notifications, droits d'exécution.

-- ---------------------------------------------------------------------------
-- Incitations : créditées le lendemain (réduisent la dette de commission).
-- ---------------------------------------------------------------------------
create or replace function public.credit_incentives()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select d.id, d.courier_id, pv.approach_bonus
    from public.deliveries d join public.delivery_private pv on pv.delivery_id = d.id
    where d.status = 'delivered' and coalesce(pv.approach_bonus, 0) > 0
      and pv.approach_bonus_credited_at is null
      and d.delivered_at < date_trunc('day', now())
    for update of pv skip locked
  loop
    perform public.wallet_apply(r.courier_id, 'incentive', -r.approach_bonus, r.id, 'Incitation à la course', null);
    update public.delivery_private set approach_bonus_credited_at = now() where delivery_id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.cleanup_jobs()
returns void
language sql security definer
set search_path = public
as $$
  delete from public.geo_cache where expires_at < now();
  delete from public.rate_limits where window_start < now() - interval '1 hour';
  -- Positions : on garde 30 jours d'historique de suivi.
  delete from public.courier_locations where created_at < now() - interval '30 days';
  -- Coursiers sans signal depuis 10 min : hors ligne.
  update public.couriers set online = false where online and last_seen_at < now() - interval '10 minutes';
$$;

-- pg_cron (disponible sur Supabase). Sous-minute supporté depuis pg_cron 1.5.
create extension if not exists pg_cron;
select cron.schedule('koursa-dispatch', '5 seconds', 'select public.dispatch_all()');
select cron.schedule('koursa-incentives', '15 0 * * *', 'select public.credit_incentives()');
select cron.schedule('koursa-cleanup', '*/10 * * * *', 'select public.cleanup_jobs()');

-- ---------------------------------------------------------------------------
-- Notifications push : appel de l'Edge Function `notify` (pg_net).
-- Renseigner une fois en production (SQL editor) :
--   insert into private_settings values ('functions_url', 'https://<ref>.supabase.co/functions/v1'),
--                                       ('notify_secret', '<même valeur que le secret NOTIFY_SECRET>');
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create table public.private_settings (
  key text primary key,
  value text not null
);
alter table public.private_settings enable row level security;
-- Aucune policy : illisible depuis les apps, accessible seulement aux fonctions security definer.

create or replace function public.notify_event()
returns trigger
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_payload jsonb;
begin
  select value into v_url from public.private_settings where key = 'functions_url';
  select value into v_secret from public.private_settings where key = 'notify_secret';
  if v_url is null or v_secret is null then return new; end if;

  if tg_table_name = 'delivery_offers' then
    v_payload := jsonb_build_object('type', 'offer', 'offer_id', new.id, 'courier_id', new.courier_id, 'summary', new.summary);
  elsif tg_table_name = 'deliveries' then
    if new.status is not distinct from old.status
       and new.arrived_pickup_at is not distinct from old.arrived_pickup_at
       and new.arrived_dropoff_at is not distinct from old.arrived_dropoff_at then
      return new;
    end if;
    v_payload := jsonb_build_object('type', 'delivery', 'delivery_id', new.id, 'client_id', new.client_id,
      'courier_id', new.courier_id, 'status', new.status, 'old_status', old.status,
      'arrived_pickup', new.arrived_pickup_at is not null and old.arrived_pickup_at is null,
      'arrived_dropoff', new.arrived_dropoff_at is not null and old.arrived_dropoff_at is null);
  elsif tg_table_name = 'couriers' then
    if new.validation_status is not distinct from old.validation_status then return new; end if;
    v_payload := jsonb_build_object('type', 'courier_status', 'courier_id', new.id, 'status', new.validation_status);
  end if;

  perform net.http_post(
    url := v_url || '/notify',
    body := v_payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 3000
  );
  return new;
end;
$$;

create trigger offers_notify after insert on public.delivery_offers
  for each row execute function public.notify_event();
create trigger deliveries_notify after update on public.deliveries
  for each row execute function public.notify_event();
create trigger couriers_notify after update of validation_status on public.couriers
  for each row execute function public.notify_event();

-- ---------------------------------------------------------------------------
-- Temps réel (Realtime respecte la RLS)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.deliveries;
alter publication supabase_realtime add table public.delivery_offers;
alter publication supabase_realtime add table public.courier_locations;
alter publication supabase_realtime add table public.admin_alerts;

-- ---------------------------------------------------------------------------
-- Stockage : documents coursiers (privé), photos de colis (privé), APK (public)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('courier-docs', 'courier-docs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('parcel-photos', 'parcel-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('courier-avatars', 'courier-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('downloads', 'downloads', true, 209715200, null)
on conflict (id) do nothing;

-- Chemins : <bucket>/<user_id>/<fichier>
create policy "docs: le coursier dépose ses documents" on storage.objects for insert to authenticated
  with check (bucket_id in ('courier-docs', 'courier-avatars', 'parcel-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs: le coursier relit ses documents" on storage.objects for select to authenticated
  using (bucket_id in ('courier-docs', 'parcel-photos') and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "docs: remplacement par le propriétaire" on storage.objects for update to authenticated
  using (bucket_id in ('courier-docs', 'courier-avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "downloads: admin publie les APK" on storage.objects for insert to authenticated
  with check (bucket_id = 'downloads' and public.is_admin());
create policy "downloads: admin remplace les APK" on storage.objects for update to authenticated
  using (bucket_id = 'downloads' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Droits d'exécution : les fonctions internes ne sont pas appelables depuis les apps.
-- ---------------------------------------------------------------------------
revoke execute on function public.dispatch_tick(uuid) from public, anon, authenticated;
revoke execute on function public.dispatch_all() from public, anon, authenticated;
revoke execute on function public.dispatch_candidates(uuid, integer) from public, anon, authenticated;
revoke execute on function public.start_search(uuid) from public, anon, authenticated;
revoke execute on function public.set_approach(uuid, integer) from public, anon, authenticated;
revoke execute on function public.wallet_apply(uuid, public.wallet_tx_type, integer, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.log_event(uuid, public.delivery_status, public.delivery_status, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.record_waiting(uuid, text, timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.credit_incentives() from public, anon, authenticated;
revoke execute on function public.cleanup_jobs() from public, anon, authenticated;
revoke execute on function public.hash_code(text) from public, anon, authenticated;
revoke execute on function public.city_pricing(uuid) from public, anon;
revoke execute on function public.notify_event() from public, anon, authenticated;
