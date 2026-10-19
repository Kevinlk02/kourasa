// Vérifie migrations + seed + tests + un scénario complet de course sur un Postgres/PostGIS
// embarqué (PGlite), sans Docker. Usage : pnpm check:sql
// auth, storage, pg_cron et pg_net sont remplacés par des bouchons minimaux.
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite({ extensions: { postgis, pgcrypto } });

const prelude = `
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists cron;
create schema if not exists net;
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role authenticated; exception when others then null; end $$;
do $$ begin create role service_role; exception when others then null; end $$;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, phone text, phone_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (id uuid, user_id uuid, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language sql as $$ select 1::bigint $$;
create publication supabase_realtime;
grant usage on schema public, extensions, auth to anon, authenticated;
`;

async function run(label, sql) {
  try {
    await db.exec(sql);
    console.log('OK  ', label);
  } catch (e) {
    console.log('FAIL', label, '\n   ', e.message, e.position ? `(pos ${e.position}: ${JSON.stringify(sql.slice(Math.max(0, e.position - 120), Number(e.position) + 60))})` : '');
    process.exitCode = 1;
  }
}

await run('prelude', prelude);
await run('extensions', 'create extension postgis with schema extensions; create extension pgcrypto with schema extensions;');
const dir = path.join(root, 'supabase', 'migrations');
for (const f of fs.readdirSync(dir).sort()) {
  let sql = fs.readFileSync(path.join(dir, f), 'utf8');
  sql = sql
    .replace(/create extension if not exists postgis[^;]*;/g, '')
    .replace(/create extension if not exists pgcrypto[^;]*;/g, '')
    .replace(/create extension if not exists pg_cron;/g, '')
    .replace(/create extension if not exists pg_net[^;]*;/g, '');
  await run(f, sql);
}
await run('seed', fs.readFileSync(path.join(root, 'supabase', 'seed.sql'), 'utf8'));

// Tests : remplace pgTAP par un is() maison
let t = fs.readFileSync(path.join(root, 'supabase', 'tests', 'database.test.sql'), 'utf8');
t = t.replace(/^begin;|^rollback;|create extension if not exists pgtap[^;]*;|select plan\(\d+\);|select \* from finish\(\);/gm, '');
await db.exec(`create table _results(n serial, ok boolean, label text, got text, want text);
create function is(got anyelement, want anyelement, label text) returns text language plpgsql as $$
begin insert into _results(ok,label,got,want) values (got is not distinct from want, label, got::text, want::text); return label; end $$;
grant all on _results to authenticated; grant all on sequence _results_n_seq to authenticated;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;`);
// rÃ©appliquer les rÃ©vocations de la migration 9 aprÃ¨s le grant global
const m9 = fs.readFileSync(path.join(dir, '20260101000009_jobs_realtime_storage.sql'), 'utf8').match(/^revoke .*;$/gm) ?? [];
await db.exec(m9.join('\n'));
await run('tests', t);
await db.exec('reset role;');
const r = await db.query('select ok, label, got, want from _results order by n');
for (const row of r.rows) console.log(row.ok ? '  âœ“' : '  âœ—', row.label, row.ok ? '' : `(obtenu ${row.got}, attendu ${row.want})`);

// ScÃ©nario complet de bout en bout avec un coursier
async function as(uid, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', false);`);
  try { return (await db.query(sql)).rows; } finally { await db.exec('reset role;'); }
}
const D = 'eeeeeeee-0000-4000-8000-000000000001';
await db.exec(`
insert into public.deliveries (id, client_id, city_id, status, pickup_lat, pickup_lng, pickup_landmark, pickup_zone_id,
  dropoff_lat, dropoff_lng, dropoff_landmark, dropoff_zone_id, recipient_name, recipient_phone, size, payer,
  distance_m, duration_s, price_locked, currency)
values ('${D}', '00000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111',
  'pending', 6.1315, 1.2225, 'Pharmacie', 'a1a1a1a1-0000-4000-8000-000000000001',
  6.2300, 1.2100, 'Portail bleu', 'a1a1a1a1-0000-4000-8000-000000000002',
  'Akos', '+22890000099', 'small', 'sender', 6000, 1080, 1500, 'XOF');
insert into public.delivery_private (delivery_id, pickup_grace_min, dropoff_grace_min, code_hash, courier_share)
values ('${D}', 5, 5, public.hash_code('4321'), 1230);`);
const steps = [];
const step = async (label, fn) => { try { const v = await fn(); steps.push(['âœ“', label, JSON.stringify(v)?.slice(0, 220)]); } catch (e) { steps.push(['âœ—', label, e.message]); process.exitCode = 1; } };
await step('start_search', async () => (await db.query(`select public.start_search('${D}') r`)).rows[0].r);
const offer = (await db.query(`select id, courier_id from public.delivery_offers where delivery_id='${D}'`)).rows[0];
await step('offre reÃ§ue par', async () => offer);
await step('coursier lit son offre (RLS)', async () => (await as(offer.courier_id, `select count(*)::int n from public.delivery_offers where delivery_id='${D}'`))[0]);
await step('autre coursier ne la voit pas', async () => (await as('00000000-0000-4000-8000-000000000022', `select count(*)::int n from public.delivery_offers where delivery_id='${D}'`))[0]);
await step('accept_offer', async () => (await as(offer.courier_id, `select public.accept_offer('${offer.id}') r`))[0].r);
await step('arrivÃ©e trop loin refusÃ©e', async () => { try { await as(offer.courier_id, `select public.courier_arrive('${D}', 6.20, 1.20)`); return 'PAS REFUSÃ‰'; } catch (e) { return e.message; } });
await step('arrivÃ©e < 100 m', async () => (await as(offer.courier_id, `select public.courier_arrive('${D}', 6.1318, 1.2226) r`))[0].r);
await db.exec(`update public.deliveries set arrived_pickup_at = now() - interval '12 minutes 30 seconds' where id='${D}'`);
await step('client voit lâ€™attente payante', async () => (await as('00000000-0000-4000-8000-0000000000c1', `select public.client_waiting('${D}') r`))[0].r);
await step('colis rÃ©cupÃ©rÃ©', async () => (await as(offer.courier_id, `select public.courier_picked_up('${D}') r`))[0].r);
await step('en route', async () => (await as(offer.courier_id, `select public.courier_start_dropoff('${D}')`)) && 'ok');
await step('ping position', async () => (await as(offer.courier_id, `select public.courier_ping('[{"lat":6.2,"lng":1.21,"recorded_at":"2026-01-01T10:00:00Z"}]'::jsonb) r`))[0].r);
await step('arrivÃ©e livraison', async () => (await as(offer.courier_id, `select public.courier_arrive('${D}', 6.2301, 1.2101) r`))[0].r);
await db.exec(`update public.deliveries set arrived_dropoff_at = now() - interval '9 minutes', picked_up_at = now() - interval '49 minutes' where id='${D}'`);
await step('suivi destinataire', async () => (await db.query(`select public.track_delivery((select tracking_token from public.deliveries where id='${D}')) r`)).rows[0].r);
await step('montant Ã  encaisser', async () => (await as(offer.courier_id, `select public.collect_preview('${D}') r`))[0].r);
await step('mauvais code refusÃ©', async () => { try { await as(offer.courier_id, `select public.courier_complete('${D}', '0000', false)`); return 'PAS REFUSÃ‰'; } catch (e) { return e.message; } });
await step('livraison', async () => (await as(offer.courier_id, `select public.courier_complete('${D}', '4321', false) r`))[0].r);
await step('portefeuille', async () => (await db.query(`select type, amount from public.wallet_transactions where delivery_id='${D}' order by created_at`)).rows);
await step('gains coursier', async () => (await as(offer.courier_id, `select public.courier_earnings(now() - interval '1 day', now() + interval '1 day') r`))[0].r);
await step('note client', async () => (await as('00000000-0000-4000-8000-0000000000c1', `select public.rate_delivery('${D}', 5, 'Top')`)) && 'ok');
await step('historique client', async () => (await as('00000000-0000-4000-8000-0000000000c1', `select public.client_history() r`)).length);
await step('incitations (veille)', async () => { await db.exec(`update public.delivery_private set approach_m=5000, approach_bonus=285 where delivery_id='${D}'; update public.deliveries set delivered_at = now() - interval '2 days' where id='${D}'`); return (await db.query('select public.credit_incentives() n')).rows[0].n; });
await step('KPI admin', async () => (await as('00000000-0000-4000-8000-0000000000ad', `select public.admin_kpis('11111111-1111-4111-8111-111111111111', now() - interval '7 days', now() + interval '1 day') r`)).map((x) => x.r));
await step('zone live admin', async () => (await as('00000000-0000-4000-8000-0000000000ad', `select public.admin_zone_live('11111111-1111-4111-8111-111111111111') r`)).length);
await step('export GeoJSON', async () => (await as('00000000-0000-4000-8000-0000000000ad', `select jsonb_array_length(public.admin_export_zones('11111111-1111-4111-8111-111111111111')->'features') n`))[0]);
await step('import GeoJSON', async () => (await as('00000000-0000-4000-8000-0000000000ad', `select public.admin_import_zones('11111111-1111-4111-8111-111111111111', public.admin_export_zones('11111111-1111-4111-8111-111111111111')) n`))[0]);
await step('non-admin refusÃ©', async () => { try { await as('00000000-0000-4000-8000-0000000000c1', `select public.admin_record_repayment('${offer.courier_id}', 100, 'x')`); return 'PAS REFUSÃ‰'; } catch (e) { return e.message; } });
await step('remboursement admin', async () => (await as('00000000-0000-4000-8000-0000000000ad', `select public.admin_record_repayment('${offer.courier_id}', 100, 'momo') n`))[0]);
await step('client ne peut pas modifier le prix', async () => { try { await as('00000000-0000-4000-8000-0000000000c1', `update public.deliveries set price_locked = 1 where id='${D}'`); return (await db.query(`select price_locked from public.deliveries where id='${D}'`)).rows[0]; } catch (e) { return e.message; } });
await step('dispatch_all', async () => (await db.query('select public.dispatch_all() n')).rows[0]);
for (const s of steps) console.log(' ', s[0], s[1], 'â†’', s[2]);

