-- Koursa — 14. Fonctions internes : jamais appelables par les utilisateurs connectés
-- (la migration 13 leur avait rendu le droit hérité de PUBLIC).
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.courier_is_busy(uuid) from authenticated;
revoke execute on function public.assert_admin() from authenticated;
