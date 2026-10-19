-- Koursa — 5. Row Level Security sur TOUTES les tables.
-- Règle : un client ne voit que ses courses ; un coursier ne voit que les courses
-- qui lui sont proposées (via delivery_offers.summary) ou assignées ; l'admin voit tout.
-- Aucune écriture directe sur les courses, portefeuilles ou statuts : tout passe
-- par des fonctions serveur (security definer) ou des Edge Functions (service role).

alter table public.countries enable row level security;
alter table public.cities enable row level security;
alter table public.zones enable row level security;
alter table public.zone_neighborhoods enable row level security;
alter table public.profiles enable row level security;
alter table public.couriers enable row level security;
alter table public.courier_wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.push_tokens enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_private enable row level security;
alter table public.delivery_offers enable row level security;
alter table public.delivery_events enable row level security;
alter table public.ratings enable row level security;
alter table public.courier_locations enable row level security;
alter table public.saved_places enable row level security;
alter table public.venues enable row level security;
alter table public.waiting_logs enable row level security;
alter table public.incidents enable row level security;
alter table public.admin_alerts enable row level security;
alter table public.outbox_sms enable row level security;
alter table public.geo_cache enable row level security;
alter table public.geo_calls_log enable row level security;
alter table public.rate_limits enable row level security;
alter table public.app_versions enable row level security;

-- Référentiel : lecture publique des éléments actifs, écriture admin.
create policy countries_read on public.countries for select using (active or public.is_admin());
create policy countries_admin on public.countries for all using (public.is_admin()) with check (public.is_admin());
create policy cities_read on public.cities for select using (active or public.is_admin());
create policy cities_admin on public.cities for all using (public.is_admin()) with check (public.is_admin());
create policy zones_read on public.zones for select using (active or public.is_admin());
create policy zones_admin on public.zones for all using (public.is_admin()) with check (public.is_admin());
create policy zone_nb_read on public.zone_neighborhoods for select using (true);
create policy zone_nb_admin on public.zone_neighborhoods for all using (public.is_admin()) with check (public.is_admin());

-- Profils : chacun le sien ; seuls nom et ville sont modifiables par l'utilisateur.
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for all using (public.is_admin()) with check (public.is_admin());
revoke update on public.profiles from authenticated, anon;
grant update (full_name, city_id) on public.profiles to authenticated;

-- Coursiers : lecture de sa propre fiche ; écriture uniquement via fonctions.
create policy couriers_self_read on public.couriers for select using (id = auth.uid() or public.is_admin());
create policy couriers_admin on public.couriers for all using (public.is_admin()) with check (public.is_admin());

create policy wallets_self_read on public.courier_wallets for select using (courier_id = auth.uid() or public.is_admin());
create policy wallets_admin on public.courier_wallets for all using (public.is_admin()) with check (public.is_admin());
create policy wallet_tx_self_read on public.wallet_transactions for select using (courier_id = auth.uid() or public.is_admin());
create policy wallet_tx_admin on public.wallet_transactions for all using (public.is_admin()) with check (public.is_admin());

create policy push_tokens_own on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Courses : le client voit les siennes, le coursier celles qui lui sont assignées.
create policy deliveries_read on public.deliveries for select using (
  client_id = auth.uid() or courier_id = auth.uid() or public.is_admin()
);
create policy deliveries_admin_update on public.deliveries for update using (public.is_admin()) with check (public.is_admin());

-- Données internes : coursier assigné + admin. Jamais le client.
create policy delivery_private_read on public.delivery_private for select using (
  public.is_admin()
  or exists (select 1 from public.deliveries d where d.id = delivery_id and d.courier_id = auth.uid())
);

create policy offers_courier_read on public.delivery_offers for select using (courier_id = auth.uid() or public.is_admin());

create policy events_read on public.delivery_events for select using (
  public.is_admin()
  or exists (select 1 from public.deliveries d where d.id = delivery_id and (d.client_id = auth.uid() or d.courier_id = auth.uid()))
);

create policy ratings_read on public.ratings for select using (
  client_id = auth.uid() or courier_id = auth.uid() or public.is_admin()
);

create policy locations_read on public.courier_locations for select using (
  courier_id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.deliveries d where d.id = delivery_id and d.client_id = auth.uid()
             and d.status in ('assigned', 'picked_up', 'delivering'))
);

create policy saved_places_own on public.saved_places for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy venues_read on public.venues for select using (validated or reported_by = auth.uid() or public.is_admin());
create policy venues_admin on public.venues for all using (public.is_admin()) with check (public.is_admin());

create policy waiting_logs_admin on public.waiting_logs for select using (public.is_admin());

create policy incidents_read on public.incidents for select using (courier_id = auth.uid() or public.is_admin());
create policy incidents_admin on public.incidents for update using (public.is_admin()) with check (public.is_admin());

create policy alerts_admin on public.admin_alerts for all using (public.is_admin()) with check (public.is_admin());
create policy outbox_admin on public.outbox_sms for select using (public.is_admin());
create policy geo_cache_admin on public.geo_cache for select using (public.is_admin());
create policy geo_log_admin on public.geo_calls_log for select using (public.is_admin());

create policy app_versions_read on public.app_versions for select using (true);
create policy app_versions_admin on public.app_versions for all using (public.is_admin()) with check (public.is_admin());

-- Les fonctions internes ne doivent pas être appelables par n'importe qui.
revoke execute on function public.check_rate_limit(uuid, text, integer) from public, anon, authenticated;
