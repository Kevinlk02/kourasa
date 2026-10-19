-- Koursa — 13. anon héritait du droit d'exécution via PUBLIC (droit par défaut de Postgres).
-- Pour chaque fonction de public : retirer PUBLIC et anon, en conservant exactement les droits
-- qu'avaient déjà authenticated et service_role (les révocations des migrations précédentes restent).
do $$
declare
  f record;
  had_auth boolean;
  had_service boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where p.pronamespace = 'public'::regnamespace and d.objid is null
  loop
    had_auth := has_function_privilege('authenticated', f.oid, 'execute');
    had_service := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    if had_auth then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if had_service then execute format('grant execute on function %s to service_role', f.sig); end if;
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from public;

-- Seules exceptions publiques : suivi destinataire et is_admin() (utilisée par les règles RLS de lecture).
grant execute on function public.track_delivery(text) to anon;
grant execute on function public.is_admin() to anon;
