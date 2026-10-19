-- Koursa — données de départ (DÉVELOPPEMENT). Rejoué par `supabase db reset`.
-- Les polygones des zones sont PROVISOIRES et grossiers : à redessiner dans /admin/zones.
-- Connexion locale : numéros +228 9000 00xx, code SMS 123456 (voir config.toml [auth.sms.test_otp]).
-- Admin web : admin@koursa.local / KoursaAdmin2026!  (ou +228 99 99 99 99, code 123456)

-- Pays, villes, tarifs et zones : migration 20260101000011_reference_data.sql.
-- Ici seulement les données de TEST (comptes, coursiers, lieux), jamais envoyées en production.
update public.cities set merchant_momo_number = '+228 90 00 00 00' where id = '11111111-1111-4111-8111-111111111111';

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
