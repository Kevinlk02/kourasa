-- Koursa — 12. Durcissement suite à l'audit Supabase (db advisors).

-- 1. search_path figé sur les fonctions de calcul pur.
alter function public.waiting_fee(jsonb, integer, timestamptz, timestamptz) set search_path = public;
alter function public.waiting_cap_reached(jsonb, integer, timestamptz, timestamptz) set search_path = public;
alter function public.approach_bonus(jsonb, integer) set search_path = public;
alter function public.late_penalty_amount(jsonb, integer, timestamptz, timestamptz, integer) set search_path = public;

-- 2. Les visiteurs non connectés (anon) n'appellent aucune fonction serveur,
--    sauf le suivi destinataire (/t/[token]) et is_admin() utilisée par les règles RLS de lecture publique.
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;
grant execute on function public.track_delivery(text) to anon;
grant execute on function public.is_admin() to anon;

-- Fonctions internes : jamais appelées directement depuis les apps.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.courier_is_busy(uuid) from authenticated;
revoke execute on function public.assert_admin() from authenticated;

-- 3. Règles RLS : auth.uid() / is_admin() évalués une fois par requête et non par ligne.
alter policy "alerts_admin" on public.admin_alerts
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "app_versions_admin" on public.app_versions
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "cities_admin" on public.cities
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "cities_read" on public.cities
  using ((active OR (select public.is_admin())));
alter policy "countries_admin" on public.countries
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "countries_read" on public.countries
  using ((active OR (select public.is_admin())));
alter policy "locations_read" on public.courier_locations
  using (((courier_id = (select auth.uid())) OR (select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = courier_locations.delivery_id) AND (d.client_id = (select auth.uid())) AND (d.status = ANY (ARRAY['assigned'::delivery_status, 'picked_up'::delivery_status, 'delivering'::delivery_status])))))));
alter policy "wallets_admin" on public.courier_wallets
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "wallets_self_read" on public.courier_wallets
  using (((courier_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "couriers_admin" on public.couriers
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "couriers_self_read" on public.couriers
  using (((id = (select auth.uid())) OR (select public.is_admin())));
alter policy "deliveries_admin_update" on public.deliveries
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "deliveries_read" on public.deliveries
  using (((client_id = (select auth.uid())) OR (courier_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "events_read" on public.delivery_events
  using (((select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_events.delivery_id) AND ((d.client_id = (select auth.uid())) OR (d.courier_id = (select auth.uid()))))))));
alter policy "offers_courier_read" on public.delivery_offers
  using (((courier_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "delivery_private_read" on public.delivery_private
  using (((select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM deliveries d
  WHERE ((d.id = delivery_private.delivery_id) AND (d.courier_id = (select auth.uid())))))));
alter policy "geo_cache_admin" on public.geo_cache
  using ((select public.is_admin()));
alter policy "geo_log_admin" on public.geo_calls_log
  using ((select public.is_admin()));
alter policy "incidents_admin" on public.incidents
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "incidents_read" on public.incidents
  using (((courier_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "outbox_admin" on public.outbox_sms
  using ((select public.is_admin()));
alter policy "profiles_admin" on public.profiles
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "profiles_self_read" on public.profiles
  using (((id = (select auth.uid())) OR (select public.is_admin())));
alter policy "profiles_self_update" on public.profiles
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));
alter policy "push_tokens_own" on public.push_tokens
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));
alter policy "ratings_read" on public.ratings
  using (((client_id = (select auth.uid())) OR (courier_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "saved_places_own" on public.saved_places
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));
alter policy "venues_admin" on public.venues
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "venues_read" on public.venues
  using ((validated OR (reported_by = (select auth.uid())) OR (select public.is_admin())));
alter policy "waiting_logs_admin" on public.waiting_logs
  using ((select public.is_admin()));
alter policy "wallet_tx_admin" on public.wallet_transactions
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "wallet_tx_self_read" on public.wallet_transactions
  using (((courier_id = (select auth.uid())) OR (select public.is_admin())));
alter policy "zone_nb_admin" on public.zone_neighborhoods
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "zones_admin" on public.zones
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
alter policy "zones_read" on public.zones
  using ((active OR (select public.is_admin())));
