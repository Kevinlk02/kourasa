-- Koursa — 10. Aides géographiques utilisées par create-delivery (service role).

-- Lieu spécial validé (restaurant) à moins de p_radius_m, ou même place_id Google.
create or replace function public.venue_near(p_city uuid, p_lat double precision, p_lng double precision, p_radius_m integer, p_place_id text default null)
returns table (id uuid, is_restaurant boolean, distance_m integer)
language sql stable security definer
set search_path = public, extensions
as $$
  select v.id, v.is_restaurant, round(extensions.st_distance(v.point, public.make_point(p_lat, p_lng)))::integer
  from public.venues v
  where v.city_id = p_city and v.validated
    and ((p_place_id is not null and v.place_id = p_place_id)
         or extensions.st_dwithin(v.point, public.make_point(p_lat, p_lng), p_radius_m))
  order by (p_place_id is not null and v.place_id = p_place_id) desc, extensions.st_distance(v.point, public.make_point(p_lat, p_lng))
  limit 1;
$$;

-- Lieu récent du client à moins de 30 m (ou même place_id) : on le réutilise au lieu d'en créer un.
create or replace function public.saved_place_near(p_user uuid, p_lat double precision, p_lng double precision, p_place_id text default null)
returns table (id uuid, use_count integer)
language sql stable security definer
set search_path = public, extensions
as $$
  select s.id, s.use_count from public.saved_places s
  where s.user_id = p_user
    and ((p_place_id is not null and s.place_id = p_place_id)
         or extensions.st_dwithin(s.point, public.make_point(p_lat, p_lng), 30))
  order by s.last_used_at desc limit 1;
$$;

-- Lieux récents / favoris du client connecté, avant toute recherche Google (gratuit).
create or replace function public.my_places(p_limit integer default 10)
returns setof jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('id', id, 'label', label, 'lat', lat, 'lng', lng, 'address', address,
    'landmark', landmark, 'place_id', place_id, 'favorite', favorite, 'last_used_at', last_used_at)
  from public.saved_places where user_id = auth.uid()
  order by favorite desc, last_used_at desc limit least(p_limit, 30);
$$;

revoke execute on function public.venue_near(uuid, double precision, double precision, integer, text) from public, anon, authenticated;
revoke execute on function public.saved_place_near(uuid, double precision, double precision, text) from public, anon, authenticated;
