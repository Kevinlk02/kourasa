-- Koursa — 11. Référentiel de lancement (production ET développement) : pays, villes, tarifs,
-- 2 zones PROVISOIRES de Lomé (à redessiner dans /admin/zones). Aucun compte, aucune donnée de test.
-- Idempotent : ne remplace jamais des valeurs déjà modifiées dans l'admin.

insert into public.countries (code, name, currency, dial_code, google_region, active) values
  ('TG', 'Togo', 'XOF', '+228', 'tg', true),
  ('TD', 'Tchad', 'XAF', '+235', 'td', false)
on conflict (code) do nothing;

-- Paramètres de prix : docs/MVP.md §5 (identiques à DEFAULT_PRICING dans packages/shared).
insert into public.cities (id, country_code, name, center_lat, center_lng, active, merchant_momo_number, pricing) values
  ('11111111-1111-4111-8111-111111111111', 'TG', 'Lomé', 6.1375, 1.2123, true, null,
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
   }'::jsonb)
on conflict (id) do nothing;

-- N'Djamena (inactive) reprend les mêmes paramètres, à ajuster avant l'ouverture.
insert into public.cities (id, country_code, name, center_lat, center_lng, active, merchant_momo_number, pricing)
select '22222222-2222-4222-8222-222222222222', 'TD', 'N''Djamena', 12.1348, 15.0557, false, null, pricing
from public.cities where id = '11111111-1111-4111-8111-111111111111'
on conflict (id) do nothing;

-- Zones provisoires de Lomé (lng, lat). Frontière commune identique entre les deux polygones.
insert into public.zones (id, city_id, code, name, color, allow_overflow, area) values
  ('a1a1a1a1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'LOME_Z1', 'Lomé Sud & Est', '#2F80ED', true,
   extensions.st_geomfromtext('MULTIPOLYGON(((1.199 6.120, 1.250 6.128, 1.280 6.135, 1.330 6.150, 1.370 6.165, 1.370 6.215, 1.270 6.190, 1.230 6.165, 1.199 6.150, 1.199 6.120)))', 4326)::extensions.geography),
  ('a1a1a1a1-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'LOME_Z2', 'Lomé Nord & Ouest', '#F2994A', true,
   extensions.st_geomfromtext('MULTIPOLYGON(((1.199 6.150, 1.230 6.165, 1.270 6.190, 1.370 6.215, 1.370 6.300, 1.150 6.300, 1.100 6.230, 1.140 6.175, 1.185 6.145, 1.199 6.150)))', 4326)::extensions.geography)
on conflict (id) do nothing;

insert into public.zone_neighborhoods (zone_id, name) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Centre-ville'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Bè'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Baguida'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Akodésséwa'),
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Léo 2000'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'Agoè-Zanguéra'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'Adidogomé'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'Djidjolé'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'CB (à préciser)')
on conflict (zone_id, name) do nothing;
