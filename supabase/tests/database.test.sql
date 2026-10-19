-- Tests pgTAP : `supabase test db` (après `supabase db reset`).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- zone_of : un point dans chaque zone, un point hors zone
select is(public.zone_of_latlng('11111111-1111-4111-8111-111111111111', 6.1310, 1.2220),
  'a1a1a1a1-0000-4000-8000-000000000001'::uuid, 'Centre-ville → Zone 1');
select is(public.zone_of_latlng('11111111-1111-4111-8111-111111111111', 6.2300, 1.2100),
  'a1a1a1a1-0000-4000-8000-000000000002'::uuid, 'Agoè → Zone 2');
select is(public.zone_of_latlng('11111111-1111-4111-8111-111111111111', 6.1300, 1.0500),
  null::uuid, 'Hors zone (Ghana) → null');

-- Règles d'argent identiques à packages/shared
select is(public.waiting_fee(public.city_pricing('11111111-1111-4111-8111-111111111111'), 5, now() - interval '12 minutes 30 seconds', now()), 350, 'attente 12 min 30 → 350 F');
select is(public.waiting_fee(public.city_pricing('11111111-1111-4111-8111-111111111111'), 5, now() - interval '2 hours', now()), 750, 'attente plafonnée à 750 F');
select is(public.approach_bonus(public.city_pricing('11111111-1111-4111-8111-111111111111'), 5000), 285, 'incitation 5 km → 285 F');
select is(public.approach_bonus(public.city_pricing('11111111-1111-4111-8111-111111111111'), 8000), 500, 'incitation plafonnée à 500 F');
select is(public.late_penalty_amount(public.city_pricing('11111111-1111-4111-8111-111111111111'), 1080, now() - interval '40 minutes', now(), 1230), 150, 'retard 3 min → 150 F');
select is(public.late_penalty_amount(public.city_pricing('11111111-1111-4111-8111-111111111111'), 1080, now() - interval '45 minutes', now(), 1230), 369, 'pénalité plafonnée à 30 %');

-- Création d'une course de test (comme le ferait create-delivery)
insert into public.deliveries (id, client_id, city_id, status, pickup_lat, pickup_lng, pickup_landmark, pickup_zone_id,
  dropoff_lat, dropoff_lng, dropoff_landmark, dropoff_zone_id, recipient_name, recipient_phone, size, payer,
  distance_m, duration_s, price_locked, currency)
values ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111',
  'pending', 6.1315, 1.2225, 'Pharmacie', 'a1a1a1a1-0000-4000-8000-000000000001',
  6.2300, 1.2100, 'Portail bleu', 'a1a1a1a1-0000-4000-8000-000000000002',
  'Akos', '+22890000099', 'small', 'recipient', 6000, 1080, 1500, 'XOF');
insert into public.delivery_private (delivery_id, pickup_grace_min, dropoff_grace_min, code_hash, courier_share)
values ('dddddddd-0000-4000-8000-000000000001', 5, 5, public.hash_code('1234'), 1230);

select is(public.start_search('dddddddd-0000-4000-8000-000000000001'), 'offered', 'vague 1 : une offre est envoyée');
select is((select courier_id from public.delivery_offers where delivery_id = 'dddddddd-0000-4000-8000-000000000001'),
  '00000000-0000-4000-8000-000000000011'::uuid, 'au coursier d''attache le plus proche');

-- RLS : un client ne lit pas les courses d'un autre
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
select is((select count(*)::int from public.deliveries), 0, 'client 2 ne voit pas la course du client 1');

-- RLS : un coursier ne lit pas une course qui ne lui est pas assignée
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select is((select count(*)::int from public.deliveries), 0, 'coursier non assigné ne voit pas la course');

-- Le client voit sa course mais jamais la partie interne (tolérance, code)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select is((select count(*)::int from public.delivery_private), 0, 'le client ne lit pas delivery_private');

select * from finish();
rollback;
