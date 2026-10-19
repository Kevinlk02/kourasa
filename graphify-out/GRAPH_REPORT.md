# Graph Report - KOURSA  (2026-10-19)

## Corpus Check
- 143 files · ~63,646 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 3, .example 1, .webmanifest 1)

## Summary
- 1280 nodes · 2502 edges · 89 communities (54 shown, 35 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.88)
- Token cost: 141,022 input · 0 output

## Community Hubs (Navigation)
- Pages back-office admin
- Config package shared
- Config Expo et scripts
- Outillage monorepo racine
- Pages publiques du site
- i18n et schemas partages
- Design tokens et historique
- Dependances site web
- Dependances package ui
- SQL deroule de course
- Ecran course coursier
- Accueil coursier et batterie
- Tables courses et index
- SQL fonctions admin
- Creation de course client
- Dependances app coursier
- Regles d'argent partagees
- Types de lignes des apps
- Dependances app client
- SQL attribution par vagues
- Modules Expo coursier
- Modules Expo client
- Config TypeScript web
- Schemas Zod des fonctions
- Ecrans client suivi
- Edge Functions Google et devis
- Specs architecture monorepo
- Layouts et connexion OTP
- Specs regles metier serveur
- Commande et notifications
- Config TypeScript de base
- Specs coursiers et argent
- SQL profils et coursiers
- Couche Google Maps serveur
- Specs securite et livraison
- Specs couts Google
- Carte Android et web
- SQL villes et zones
- SQL taches planifiees
- Config Turborepo
- TS config client
- Statuts de course
- SQL cache Google et versions
- TS config coursier
- Specs vue d'ensemble
- Specs distribution APK
- Contexte de devis
- Scripts app client
- Config Deno fonctions
- TS config ui
- SQL lieux et restaurants
- Scripts app coursier
- TS config shared
- Web Push PWA
- Dev deps client
- Service worker PWA
- Dev deps coursier
- Navigation Google Maps

## God Nodes (most connected - your core abstractions)
1. `getSupabase()` - 42 edges
2. `t()` - 40 edges
3. `formatMoney()` - 32 edges
4. `Home()` - 30 edges
5. `Course()` - 29 edges
6. `rpc()` - 26 edges
7. `Body()` - 26 edges
8. `Title()` - 25 edges
9. `supabase()` - 24 edges
10. `rpcMessage()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `Acceptation atomique (UPDATE WHERE status='searching' RETURNING)` --semantically_similar_to--> `Changements de statut atomiques (SELECT FOR UPDATE) journalises`  [INFERRED] [semantically similar]
  docs/ZONES.md → CLAUDE.md
- `EXAMPLES` --calls--> `computePrice()`  [EXTRACTED]
  apps/web/app/page.tsx → packages/shared/src/pricing.ts
- `Page de suivi destinataire /t/[token]` --references--> `apps/web (Next.js: site, /app PWA, /admin, /t/[token])`  [EXTRACTED]
  docs/DISTRIBUTION.md → CLAUDE.md
- `Row Level Security sur toutes les tables` --references--> `Table deliveries`  [INFERRED]
  CLAUDE.md → docs/MVP.md
- `Delivery` --references--> `DeliveryStatus`  [EXTRACTED]
  apps/client/app/delivery/[id].tsx → packages/shared/src/status.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Calcul et gel du prix a la commande** — docs_prompts_quote, docs_prompts_create_delivery, docs_google_maps_route, docs_prompts_zone_of, docs_mvp_cities_pricing, docs_mvp_price_locked, packages_shared [EXTRACTED 1.00]
- **Argent coursier: commission, incitations, penalites, attente** — docs_mvp_cash_commission, docs_mvp_approach_bonus, docs_mvp_late_penalty, docs_mvp_waiting_fees, docs_mvp_courier_wallets, docs_mvp_wallet_transactions [EXTRACTED 1.00]
- **Couche Edge Functions Google (cache, log, Zod)** — docs_google_maps_places_autocomplete, docs_google_maps_place_details, docs_google_maps_reverse_geocode, docs_google_maps_route, docs_google_maps_geo_cache, docs_google_maps_geo_calls_log [EXTRACTED 1.00]

## Communities (89 total, 35 thin omitted)

### Community 0 - "Pages back-office admin"
Cohesion: 0.05
Nodes (70): Live, LiveMap(), Courses(), Detail(), C, Couriers(), Detail(), setStatus() (+62 more)

### Community 1 - "Config package shared"
Cohesion: 0.05
Nodes (53): dependencies, zod, devDependencies, vitest, exports, ./i18n/fr.json, main, name (+45 more)

### Community 2 - "Config Expo et scripts"
Cohesion: 0.05
Nodes (32): @electric-sql/pglite, @electric-sql/pglite-postgis, db, dir, steps, t, dst, root (+24 more)

### Community 3 - "Outillage monorepo racine"
Cohesion: 0.05
Nodes (42): devDependencies, @electric-sql/pglite, @electric-sql/pglite-postgis, eslint, @eslint/js, eslint-plugin-react-hooks, globals, prettier (+34 more)

### Community 4 - "Pages publiques du site"
Cohesion: 0.08
Nodes (30): Confidentialite(), metadata, Coursiers(), metadata, revalidate, metadata, viewport, MentionsLegales() (+22 more)

### Community 5 - "i18n et schemas partages"
Cohesion: 0.06
Nodes (35): dictionaries, MessageKey, autocompleteRequestSchema, CourierAction, courierActionSchema, CourierSignup, courierSignupSchema, CreateDeliveryRequest (+27 more)

### Community 6 - "Design tokens et historique"
Cohesion: 0.13
Nodes (20): colors, font, radius, sizes, spacing, Step, Screen(), STATUS_COLORS (+12 more)

### Community 7 - "Dependances site web"
Cohesion: 0.05
Nodes (37): dependencies, @koursa/shared, next, qrcode, react, react-dom, @supabase/supabase-js, terra-draw (+29 more)

### Community 8 - "Dependances package ui"
Cohesion: 0.06
Nodes (35): dependencies, @koursa/shared, devDependencies, @types/react, expo-constants, expo-device, expo-linking, expo-notifications (+27 more)

### Community 9 - "SQL deroule de course"
Cohesion: 0.11
Nodes (20): public.client_cancel(), public.client_history(), public.client_waiting(), public.collect_preview(), public.courier_apply(), public.courier_arrive(), public.courier_cancel(), public.courier_complete() (+12 more)

### Community 10 - "Ecran course coursier"
Cohesion: 0.14
Nodes (31): act(), rate(), Collect, Course(), arrive(), clientAbsent(), complete(), pickedUp() (+23 more)

### Community 11 - "Accueil coursier et batterie"
Cohesion: 0.14
Nodes (25): Battery(), STEPS, Home(), reportRestaurant(), toggleOnline(), Link(), Redirect(), km() (+17 more)

### Community 12 - "Tables courses et index"
Cohesion: 0.14
Nodes (25): courier_locations_delivery_idx, deliveries_client_idx, deliveries_courier_idx, deliveries_pickup_gix, deliveries_status_idx, deliveries_zone_idx, delivery_events_delivery_idx, incidents_status_idx (+17 more)

### Community 13 - "SQL fonctions admin"
Cohesion: 0.09
Nodes (8): public.admin_add_venue(), public.admin_export_zones(), public.admin_google_calls(), public.admin_import_zones(), public.admin_kpis(), public.admin_live_map(), public.admin_money_summary(), public.admin_venue_waits()

### Community 14 - "Creation de course client"
Cohesion: 0.12
Nodes (24): SIZES, Step, CityInfo, km(), newSessionToken(), Mode, PlaceDraft, PlacePicker() (+16 more)

### Community 15 - "Dependances app coursier"
Cohesion: 0.07
Nodes (29): expo, expo-constants, expo-device, expo-linking, expo-location, expo-notifications, expo-router, expo-status-bar (+21 more)

### Community 16 - "Regles d'argent partagees"
Cohesion: 0.09
Nodes (21): CollectInput, CollectResult, CURRENCY_LABEL, LatePenaltyInput, Payer, platformCommission(), WaitingResult, commissionOf() (+13 more)

### Community 17 - "Types de lignes des apps"
Cohesion: 0.11
Nodes (25): Delivery, Row, ActiveRow, CourierState, Row, Track, Payer, PackageSize (+17 more)

### Community 18 - "Dependances app client"
Cohesion: 0.07
Nodes (27): expo, expo-constants, expo-device, expo-linking, expo-location, expo-notifications, expo-router, expo-status-bar (+19 more)

### Community 19 - "SQL attribution par vagues"
Cohesion: 0.10
Nodes (8): public.accept_offer(), public.city_pricing(), public.courier_is_busy(), public.dispatch_all(), public.dispatch_candidates(), public.dispatch_tick(), public.set_approach(), public.wallet_apply()

### Community 20 - "Modules Expo coursier"
Cohesion: 0.08
Nodes (25): dependencies, expo, expo-constants, expo-device, expo-image-picker, expo-intent-launcher, expo-linking, expo-location (+17 more)

### Community 21 - "Modules Expo client"
Cohesion: 0.09
Nodes (22): dependencies, expo, expo-constants, expo-device, expo-linking, expo-location, expo-notifications, expo-router (+14 more)

### Community 22 - "Config TypeScript web"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+13 more)

### Community 23 - "Schemas Zod des fonctions"
Cohesion: 0.09
Nodes (21): autocompleteRequestSchema, CourierAction, courierActionSchema, CourierSignup, courierSignupSchema, CreateDeliveryRequest, incidentSchema, latLngSchema (+13 more)

### Community 24 - "Ecrans client suivi"
Cohesion: 0.22
Nodes (19): CourierInfo, Track(), Waiting, History(), Home(), NewDelivery(), order(), useCity() (+11 more)

### Community 25 - "Edge Functions Google et devis"
Cohesion: 0.28
Nodes (11): zod, schema, DEFAULT_PRICING, corsHeaders, handler(), HttpError, json(), loadCity() (+3 more)

### Community 26 - "Specs architecture monorepo"
Cohesion: 0.17
Nodes (17): apps/client (Expo, APK Android + PWA), PWA HTML shell Koursa (apps/client/public/index.html), Enregistrement service worker /app/sw.js (scope /app/), /app/manifest.webmanifest, apps/courier (Expo, APK Android), apps/web (Next.js: site, /app PWA, /admin, /t/[token]), Monorepo pnpm + Turborepo (TypeScript strict), Configuration Google Cloud (APIs, 3 cles, alerte budget, quotas) (+9 more)

### Community 27 - "Layouts et connexion OTP"
Cohesion: 0.27
Nodes (12): Gate(), RootLayout(), Gate(), RootLayout(), flushQueue(), AuthFlow(), Loading(), onNotificationTap() (+4 more)

### Community 28 - "Specs regles metier serveur"
Cohesion: 0.14
Nodes (15): Back-office admin (/admin), Table cities, cities.pricing (JSON des parametres), Table countries, Indicateurs par zone, Multi-pays Togo/Tchad (XOF/XAF, +228/+235), Couche PaymentProvider abstraite (V2), Edge Function quote (+7 more)

### Community 29 - "Commande et notifications"
Cohesion: 0.16
Nodes (11): CLIENT_MESSAGES, createDeliveryRequestSchema, PlaceInput, fetchWithTimeout(), PushMessage, pushToUser(), vapidPrivate, vapidPublic (+3 more)

### Community 30 - "Config TypeScript de base"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+9 more)

### Community 31 - "Specs coursiers et argent"
Cohesion: 0.15
Nodes (15): Edge Function accept-offer, Incitation a la course (bonus d'approche 95 F/km, plafond 500 F), Table courier_locations, Table courier_wallets, Table couriers (home_zone_id, position), Table delivery_offers, Penalite de retard du coursier, Points encore ouverts (+7 more)

### Community 32 - "SQL profils et coursiers"
Cohesion: 0.23
Nodes (11): couriers_available_idx, couriers_position_gix, on_auth_user_created, public.courier_wallets, public.couriers, public.handle_new_user(), public.is_admin(), public.profiles (+3 more)

### Community 33 - "Couche Google Maps serveur"
Cohesion: 0.30
Nodes (14): detectRestaurant(), autocomplete(), cacheSet(), googleFetch(), isRestaurantTypes(), logCall(), nearbyRestaurant(), placeDetails (+6 more)

### Community 34 - "Specs securite et livraison"
Cohesion: 0.18
Nodes (12): Page de suivi destinataire /t/[token], Montant total a encaisser a la livraison, Table deliveries, Code de livraison a 4 chiffres (hashe), Table delivery_events, Statuts d'une course (pending→searching→assigned→picked_up→delivering→delivered), price_locked (prix fige a la commande), Table ratings (+4 more)

### Community 35 - "Specs couts Google"
Cohesion: 0.25
Nodes (12): Validation des entrees Zod (app et Edge Function), Reponse degradee: vol d'oiseau x 1,3, Table geo_cache, Table geo_calls_log, Edge Function place-details (isRestaurant), Google Places API (New), Edge Function places-autocomplete, Edge Function reverse-geocode (+4 more)

### Community 36 - "Carte Android et web"
Cohesion: 0.20
Nodes (10): DELTA_BY_ZOOM(), KoursaMap(), loadMaps(), styles, Window, KoursaMapProps, LatLng, MapMarker (+2 more)

### Community 37 - "SQL villes et zones"
Cohesion: 0.30
Nodes (8): public.cities, public.countries, public.zone_neighborhoods, public.zone_of(), public.zones, public.zones_geojson, zones_area_gix, zones_city_idx

### Community 38 - "SQL taches planifiees"
Cohesion: 0.24
Nodes (6): couriers_notify, deliveries_notify, offers_notify, public.credit_incentives(), public.notify_event(), public.private_settings

### Community 39 - "Config Turborepo"
Cohesion: 0.17
Nodes (11): dependsOn, outputs, outputs, $schema, tasks, build, lint, test (+3 more)

### Community 40 - "TS config client"
Cohesion: 0.18
Nodes (10): compilerOptions, allowImportingTsExtensions, noEmit, noUncheckedIndexedAccess, paths, strict, exclude, extends (+2 more)

### Community 41 - "Statuts de course"
Cohesion: 0.18
Nodes (8): ACTIVE_STATUSES, courierStep, DELIVERY_STATUSES, DeliveryStatus, FINAL_STATUSES, INCIDENT_KINDS, IncidentKind, TRANSITIONS

### Community 42 - "SQL cache Google et versions"
Cohesion: 0.24
Nodes (8): app_versions_latest_idx, geo_cache_expires_idx, geo_calls_log_day_idx, public.app_versions, public.app_versions_latest, public.geo_cache, public.geo_calls_log, public.rate_limits

### Community 43 - "TS config coursier"
Cohesion: 0.20
Nodes (9): compilerOptions, allowImportingTsExtensions, noEmit, noUncheckedIndexedAccess, strict, exclude, extends, include (+1 more)

### Community 44 - "Specs vue d'ensemble"
Cohesion: 0.27
Nodes (9): Design system Uber-like (identite propre), Koursa (app de livraison moto, Lome/N'Djamena), Backend Supabase (Postgres+PostGIS, Auth OTP, Realtime, Storage, Edge Functions, pg_cron), Firebase Cloud Messaging (notifications push), Prerequis et comptes a creer (Supabase, Google Cloud, Firebase, EAS, SMS, Vercel, Sentry), Fournisseur SMS pour Supabase Auth OTP (+228/+235), Web Push (PWA iOS 16.4+), Phases de construction 0 a 10 (+1 more)

### Community 45 - "Specs distribution APK"
Cohesion: 0.32
Nodes (7): APK Android (client et coursier), Table app_versions, Bucket Supabase Storage downloads/, Profil EAS 'apk' (eas.json, tg.koursa.client / tg.koursa.courier), EAS Update (mises a jour JS), Verification de version au demarrage (min_version / latest_version), Script pnpm release:android

### Community 46 - "Contexte de devis"
Cohesion: 0.32
Nodes (7): PackageSize, PricingParams, LatLng, buildQuote(), QuoteContext, zoneOf(), CityRow

### Community 47 - "Scripts app client"
Cohesion: 0.29
Nodes (7): scripts, android, export:web, lint, start, typecheck, web

### Community 48 - "Config Deno fonctions"
Cohesion: 0.29
Nodes (6): compilerOptions, strict, imports, @supabase/supabase-js, web-push, zod

### Community 49 - "TS config ui"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 50 - "SQL lieux et restaurants"
Cohesion: 0.40
Nodes (3): public.my_places(), public.saved_place_near(), public.venue_near()

### Community 51 - "Scripts app coursier"
Cohesion: 0.40
Nodes (5): scripts, android, lint, start, typecheck

### Community 52 - "TS config shared"
Cohesion: 0.50
Nodes (3): extends, include, ../../tsconfig.base.json

### Community 54 - "Dev deps client"
Cohesion: 0.67
Nodes (3): devDependencies, cross-env, @types/react

## Knowledge Gaps
- **91 isolated node(s):** `@koursa/shared`, `@koursa/ui`, `@react-native-async-storage/async-storage`, `@supabase/supabase-js`, `expo` (+86 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 624 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `zod` connect `Edge Functions Google et devis` to `Config package shared`, `i18n et schemas partages`, `Schemas Zod des fonctions`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `@koursa/shared`, `@koursa/ui`, `@react-native-async-storage/async-storage` to the rest of the system?**
  _91 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Pages back-office admin` be split into smaller, more focused modules?**
  _Cohesion score 0.05464725643896976 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `Modules Expo coursier` to `Dependances app coursier`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Should `Config package shared` be split into smaller, more focused modules?**
  _Cohesion score 0.05310734463276836 - nodes in this community are weakly interconnected._
- **Why does `expo-task-manager` connect `Dependances app coursier` to `Accueil coursier et batterie`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Should `Config Expo et scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.053877551020408164 - nodes in this community are weakly interconnected._