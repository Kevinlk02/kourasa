# Koursa — livraison à moto (Lomé, puis N'Djamena)

Monorepo complet : app **client** (APK Android + PWA iPhone), app **coursier** (APK Android), **site web + back-office**, **backend Supabase**.
Spécifications : `CLAUDE.md` et `docs/` (source de vérité : `docs/MVP.md`).

## Ce qui est construit

| Partie | Contenu |
|---|---|
| `supabase/migrations` (10 fichiers) | Pays, villes (`pricing` JSON), zones PostGIS, profils, coursiers, portefeuilles, courses (+ partie interne invisible du client), offres, journal, notes, positions, lieux récents, restaurants, incidents, cache Google, versions. **RLS sur toutes les tables.** Fonctions serveur atomiques : attribution par vagues (cron toutes les 5 s), acceptation, « Je suis arrivé » (< 100 m), attente, code à 4 chiffres (haché), encaissement, commission 18 %, pénalité de retard, incitation créditée le lendemain, blocage au-delà du seuil, KPI admin, import/export GeoJSON. |
| `supabase/functions` | Edge Functions : `places-autocomplete`, `place-details`, `reverse-geocode`, `route`, `quote`, `create-delivery`, `accept-offer`, `notify` (push Expo/FCM + Web Push). Cache, journal des appels, limitation de débit, délai 5 s, mode dégradé. |
| `packages/shared` | Formule de prix, attente, encaissement, incitation, pénalité, attribution par vagues, statuts, schémas Zod, i18n `fr.json`, design tokens. |
| `packages/ui` | Design system (Button, Input, PhoneInput, BottomSheet, StatusPill, ZoneBadge, MapPin, Timer…), carte Android/web, connexion OTP, contrôle de version, push. |
| `apps/client` | Accueil carte + « Où livrer ? », création de course (lieux récents → position → recherche Google → épingle, repère obligatoire, destinataire, taille, payeur, prix), recherche/annulation, suivi temps réel, attente, notation, historique. Export web = PWA. |
| `apps/courier` | Inscription + 4 photos, attente de validation, zone d'attache sur la carte, en ligne/hors ligne, GPS toutes les 10 s en arrière-plan avec file d'attente hors réseau, offre plein écran 20 s, déroulé complet, montant à encaisser, attente refusée, client absent, incidents, itinéraire Google Maps, gains + commission due, aide batterie, signaler un restaurant. |
| `apps/web` | `/`, `/telecharger` (Android/iPhone/ordinateur + QR + SHA-256), `/telecharger/koursa.apk`, `/coursiers`, mentions légales, confidentialité, `/t/[token]` (suivi destinataire), `/app` (PWA), `/admin` (tableau de bord par zone, carte live, zones avec dessin terra-draw + GeoJSON, courses, coursiers + documents, incidents/litiges, tarifs avec aperçu 3/6/10 km, restaurants, versions des APK, appels Google). |

## Vérifications déjà faites
- `pnpm typecheck` · `pnpm lint` · `pnpm test` (49 tests métier : prix au franc près, attente, deux cas de payeur, incitation, pénalité, vagues)
- `pnpm check:sql` : migrations + seed + 14 tests SQL + un scénario complet de course sur un vrai Postgres/PostGIS embarqué (sans Docker)
- `pnpm test:functions` (Deno) : couche Google avec Google simulé
- Build de production du site et export web de la PWA

## Démarrer en local
Prérequis : Node 20+, pnpm 9, **Docker Desktop**, **Supabase CLI**, (Deno pour les tests des fonctions).

```bash
pnpm install
supabase start              # affiche l'URL locale et la clé anon
supabase db reset           # migrations + seed
cp .env.example .env        # remplir les clés (URL + clé anon au minimum)
pnpm env:sync               # copie .env dans chaque app
supabase functions serve --env-file .env
pnpm dev:web                # http://localhost:3000  (admin : /admin)
pnpm dev:client             # app client (Expo)
pnpm dev:courier            # app coursier (Expo)
```

Comptes de test (seed, local uniquement) — code SMS **123456** :
- Admin web : `admin@koursa.local` / `KoursaAdmin2026!`
- Clients : +228 90 00 00 01, +228 90 00 00 02
- Coursiers validés : +228 90 00 00 11/12/13 (Zone 1), 21/22/23 (Zone 2)

Les cartes, la recherche d'adresse et les itinéraires demandent les clés Google (`docs/GOOGLE_MAPS.md`). Sans clé, le prix utilise la distance à vol d'oiseau × 1,3.

## Mise en production
1. **Supabase** : créer le projet, `supabase link`, `supabase db push` (pas de seed en prod), activer Phone Auth avec le fournisseur SMS.
2. **Secrets des fonctions** : `supabase secrets set GOOGLE_MAPS_SERVER_KEY=… SMS_PROVIDER=… SMS_API_KEY=… SITE_URL=https://… NOTIFY_SECRET=… WEB_PUSH_VAPID_PUBLIC_KEY=… WEB_PUSH_VAPID_PRIVATE_KEY=…` puis `pnpm sync:functions && supabase functions deploy`.
3. **Notifications** (une fois, dans l'éditeur SQL) :
   `insert into private_settings values ('functions_url','https://<ref>.supabase.co/functions/v1'), ('notify_secret','<NOTIFY_SECRET>');`
4. **Premier admin** : créer l'utilisateur dans Supabase Auth, puis `update profiles set role='admin' where id='…';`
5. **Site** : Vercel, racine `apps/web`, commande `pnpm build:web` (exporte la PWA puis construit le site), variables `NEXT_PUBLIC_*` et `EXPO_PUBLIC_*`, domaine en HTTPS.
6. **APK** : `eas init` dans `apps/client` et `apps/courier` (renseigner `EAS_PROJECT_ID_*`), puis `pnpm release:android client` / `courier`, puis publier dans `/admin/versions`.
7. **Sauvegarde vitale** : `eas credentials` → télécharger le **keystore** de chaque app et le garder à 2 endroits sûrs. Sans lui, plus aucune mise à jour possible.
8. Mises à jour JS : `eas update --channel production` (sans nouvel APK).

## Ce qu'il reste à faire de ton côté
- Clés et comptes : Supabase, Google Cloud (3 clés restreintes + alerte budget), Firebase (`google-services.json`), fournisseur SMS (tester +228 / +235), EAS, domaine, Vercel.
- Nom, logo et couleur définitifs (icônes provisoires : `pnpm icons`).
- Redessiner les 2 zones dans `/admin/zones` (polygones du seed provisoires).
- Compléter les mentions légales et la confidentialité (faire relire par un juriste).
- Sentry (phase 10) n'est pas encore branché.
- Points ouverts du MVP : paramètres de pénalité et coût réel par km (modifiables dans `/admin/tarifs`).

## À tester sur le terrain (coursiers pilotes)
Réception des offres écran éteint (Tecno / Infinix / Itel, économiseur désactivé) · GPS « Je suis arrivé » dans les ruelles · 3G instable (file d'attente des positions) · délivrabilité des SMS · lisibilité du montant à encaisser · détection des restaurants/maquis · attribution entre les 2 zones · remboursement mobile money et déblocage.

## Graphe de connaissances (Graphify)
`graphify-out/` contient le graphe du projet (specs + code). Pour poser une question : `graphify query "comment est calculé le prix ?"`.
