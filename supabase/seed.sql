-- Koursa — données de départ (DÉVELOPPEMENT). Rejoué par `supabase db reset`.
-- Les polygones des zones sont PROVISOIRES et grossiers : à redessiner dans /admin/zones.
-- Connexion locale : numéros +228 9000 00xx, code SMS 123456 (voir config.toml [auth.sms.test_otp]).
-- Admin web : admin@koursa.local / KoursaAdmin2026!  (ou +228 99 99 99 99, code 123456)

insert into public.countries (code, name, currency, dial_code, google_region, active) values
  ('TG', 'Togo', 'XOF', '+228', 'tg', true),
  ('TD', 'Tchad', 'XAF', '+235', 'td', false);

-- Paramètres de prix : docs/MVP.md §5 (identiques à DEFAULT_PRICING dans packages/shared).
insert into public.cities (id, country_code, name, center_lat, center_lng, active, merchant_momo_number, pricing) values
  ('11111111-1111-4111-8111-111111111111', 'TG', 'Lomé', 6.1375, 1.2123, true, '+228 90 00 00 00',
   '{
     "fuel_price_per_l": 680, "fuel_l_per_km": 0.04, "wear_per_km": 67.8,
     "courier_hourly_target": 1200, "margin_rate": 0.18, "minimum_price": 700,
     "size_coef": {"small": 1, "medium": 1.2, "large": 1.5},
     "included_approach_km": 2, "time_buffer_min": 5, "rounding": 100,
     "detour_factor": 1.3, "fallback_speed_kmh": 22,
     "approach_bonus_per_km": 95, "approach_bonus_cap": 500,
     "waiting": {"grace_min": 5, "restaurant_grace_min": 15, "fee_per_min": 50, "max_billable_min": 15},
     "late_penalty": {"factor": 1.5, "extra_min": 10, "per_min": 50, "cap_rate": 0.3},
     "block_threshold": 5000, "allow_dropoff_outside": false,
     "dispatch": {"offer_timeout_s": 20, "wave_timeout_s": 90, "unassigned_after_s": 180, "overflow_radius_m": 3000, "location_max_age_s": 120},
     "arrival_radius_m": 100, "restaurant_radius_m": 50
   }'::jsonb);

-- N'Djamena (inactive) reprend les mêmes paramètres, à ajuster avant l'ouverture.
insert into public.cities (id, country_code, name, center_lat, center_lng, active, merchant_momo_number, pricing)
select '22222222-2222-4222-8222-222222222222', 'TD', 'N''Djamena', 12.1348, 15.0557, false, null, pricing
from public.cities where id = '11111111-1111-4111-8111-111111111111';

-- Zones provisoires de Lomé (lng, lat). Frontière commune identique entre les deux polygones.
insert into public.zones (id, city_id, code, name, color, allow_overflow, area) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'LOME_Z1', 'Lomé Sud & Est', '#2F80ED', true,
   extensions.st_geomfromtext('MULTIPOLYGON(((1.199 6.120, 1.250 6.128, 1.280 6.135, 1.330 6.150, 1.370 6.165, 1.370 6.215, 1.270 6.190, 1.230 6.165, 1.199 6.150, 1.199 6.120)))', 4326)::extensions.geography),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'LOME_Z2', 'Lomé Nord & Ouest', '#F2994A', true,
   extensions.st_geomfromtext('MULTIPOLYGON(((1.199 6.150, 1.230 6.165, 1.270 6.190, 1.370 6.215, 1.370 6.300, 1.150 6.300, 1.100 6.230, 1.140 6.175, 1.185 6.145, 1.199 6.150)))', 4326)::extensions.geography);

insert into public.zone_neighborhoods (zone_id, name) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Centre-ville'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Bè'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Baguida'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Akodésséwa'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Léo 2000'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'Agoè-Zanguéra'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'Adidogomé'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'Djidjolé'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'CB (à préciser)');

-- ---------------------------------------------------------------------------
-- Utilisateurs de test (auth.users → le trigger crée les profils)
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  case when u.email is not null then extensions.crypt('KoursaAdmin2026!', extensions.gen_salt('bf')) else '' end,
  case when u.email is not null then now() end, u.phone, now(),
  jsonb_build_object('provider', case when u.email is not null then 'email' else 'phone' end, 'providers', jsonb_build_array(case when u.email is not null then 'email' else 'phone' end)),
  jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-8000-0000000000ad', 'admin@koursa.local', '22899999999', 'Admin Koursa'),
  ('00000000-0000-4000-8000-0000000000c1', null, '22890000001', 'Ama Mensah'),
  ('00000000-0000-4000-8000-0000000000c2', null, '22890000002', 'Kodjo Agbeko'),
  ('00000000-0000-4000-8000-000000000011', null, '22890000011', 'Yao Koffi'),
  ('00000000-0000-4000-8000-000000000012', null, '22890000012', 'Kossi Amegah'),
  ('00000000-0000-4000-8000-000000000013', null, '22890000013', 'Edem Lawson'),
  ('00000000-0000-4000-8000-000000000021', null, '22890000021', 'Komlan Adjo'),
  ('00000000-0000-4000-8000-000000000022', null, '22890000022', 'Mawuli Dossou'),
  ('00000000-0000-4000-8000-000000000023', null, '22890000023', 'Sena Akakpo')
) as u(id, email, phone, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, coalesce(u.email, u.phone),
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'phone', u.phone, 'email_verified', u.email is not null, 'phone_verified', true),
  case when u.email is not null then 'email' else 'phone' end, now(), now(), now()
from auth.users u where u.id::text like '00000000-0000-4000-8000-%';

update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000ad';

-- 6 coursiers validés : 3 par zone, positionnés dans leur zone, en ligne.
insert into public.couriers (id, city_id, validation_status, vehicle_model, plate, home_zone_id, online, position, current_zone_id, last_seen_at, validated_at)
select c.id::uuid, '11111111-1111-4111-8111-111111111111', 'validated', c.model, c.plate, c.zone::uuid, true,
  public.make_point(c.lat, c.lng), c.zone::uuid, now(), now()
from (values
  ('00000000-0000-4000-8000-000000000011', 'Haojue 125', 'TG-4521-AB', 'a1a1a1a1-0000-4000-8000-000000000001', 6.1310, 1.2220),
  ('00000000-0000-4000-8000-000000000012', 'Bajaj Boxer', 'TG-7788-AC', 'a1a1a1a1-0000-4000-8000-000000000001', 6.1400, 1.2600),
  ('00000000-0000-4000-8000-000000000013', 'Haojue 125', 'TG-1203-AD', 'a1a1a1a1-0000-4000-8000-000000000001', 6.1500, 1.3000),
  ('00000000-0000-4000-8000-000000000021', 'Sanya 125', 'TG-3344-BA', 'a1a1a1a1-0000-4000-8000-000000000002', 6.1900, 1.1700),
  ('00000000-0000-4000-8000-000000000022', 'Bajaj Boxer', 'TG-9090-BB', 'a1a1a1a1-0000-4000-8000-000000000002', 6.2300, 1.2100),
  ('00000000-0000-4000-8000-000000000023', 'Haojue 125', 'TG-5656-BC', 'a1a1a1a1-0000-4000-8000-000000000002', 6.2100, 1.2500)
) as c(id, model, plate, zone, lat, lng);

update public.profiles set role = 'courier' where id in (select id from public.couriers);
insert into public.courier_wallets (courier_id, currency) select id, 'XOF' from public.couriers;

-- Un restaurant connu (règle des 15 min).
insert into public.venues (city_id, name, point, source, validated, kind) values
  ('11111111-1111-4111-8111-111111111111', 'Maquis du Grand Marché (exemple)', public.make_point(6.1302, 1.2235), 'admin', true, 'restaurant');

-- Lieux récents du client de test.
insert into public.saved_places (user_id, label, lat, lng, address, landmark, favorite) values
  ('00000000-0000-4000-8000-0000000000c1', 'Boutique', 6.1320, 1.2240, 'Grand Marché, Lomé', 'Entrée côté pharmacie', true),
  ('00000000-0000-4000-8000-0000000000c1', 'Maison', 6.2050, 1.1850, 'Adidogomé, Lomé', 'Portail bleu derrière l''école', true);

insert into public.app_versions (app, platform, latest_version, min_version, apk_url, changelog) values
  ('client', 'android', '1.0.0', '1.0.0', '/telecharger/koursa.apk', 'Première version'),
  ('courier', 'android', '1.0.0', '1.0.0', '/telecharger/koursa-coursier.apk', 'Première version'),
  ('client', 'web', '1.0.0', '1.0.0', null, 'Première version');
