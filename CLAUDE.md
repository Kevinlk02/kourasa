# CLAUDE.md — Koursa (nom provisoire)

Application de livraison par coursiers à moto (colis, documents, petits achats, retraits au restaurant).
Lancement à **Lomé (Togo)**, découpée en **2 zones**. **N'Djamena (Tchad)** ensuite, sur le même code.
Inspiration UX : la sobriété des apps de VTC type Uber (carte plein écran, bottom sheet, gros boutons, très peu de texte).
**On s'inspire des patterns, on ne copie ni le logo, ni le nom, ni les couleurs, ni les assets d'Uber.**

## Documents à lire avant toute tâche
| Fichier | Contenu |
|---|---|
| `docs/MVP.md` | Périmètre, écrans, règles métier (prix, incitations, attente, pénalités). **Source de vérité.** |
| `docs/ZONES.md` | Les 2 zones de Lomé et l'algorithme d'attribution des courses par zone |
| `docs/GOOGLE_MAPS.md` | APIs Google utilisées, clés, proxy serveur, maîtrise des coûts |
| `docs/DISTRIBUTION.md` | Pas de Play Store ni d'App Store : APK sur notre site, PWA iOS, mises à jour |
| `docs/PROMPTS.md` | Les phases de construction, dans l'ordre |

Si un choix produit n'est pas tranché dans ces documents (voir « Points ouverts » en fin de `MVP.md`), **pose-moi la question au lieu d'inventer**.

## Stack (ne pas en changer sans me demander)
- Monorepo **pnpm + Turborepo**, TypeScript strict partout
- `apps/client` — Expo SDK récent (React Native, Expo Router). Sorties : **APK Android** + **export web installable (PWA)** pour iPhone
- `apps/courier` — Expo (React Native, Expo Router). Sortie : **APK Android uniquement**
- `apps/web` — Next.js (App Router) + Tailwind. Contient : le **site public** (accueil + page `/telecharger`), la **PWA client** servie sous `/app`, le **back-office** sous `/admin`, la page de suivi destinataire `/t/[token]`
- `packages/shared` — types, schémas Zod, formule de prix, règles d'attente, i18n, design tokens, constantes de statut
- `packages/ui` — composants RN partagés (Button, BottomSheet, Input, PhoneInput, MapPin, Timer, StatusPill…)
- Backend : **Supabase** (Postgres + **PostGIS**, Auth téléphone OTP, Realtime, Storage, Edge Functions Deno, pg_cron)
- Cartes : `react-native-maps` (fournisseur Google) sur Android ; Maps JavaScript API sur le web
- Notifications : `expo-notifications` via **FCM** (fonctionne hors Play Store) ; Web Push pour la PWA
- Builds : **EAS Build** en profil `apk` ; mises à jour JS via **EAS Update**

## Règles de code
- **Toute la logique métier sensible tourne côté serveur** (Edge Functions / fonctions SQL) : prix, zone d'une adresse, attribution des courses, changements de statut, commissions, incitations, frais d'attente, pénalités. Jamais de montant calculé uniquement côté client.
- **Le prix est figé à la commande** (`price_locked`). Formule et paramètres : `docs/MVP.md` section 5. Tous les paramètres viennent de `cities.pricing` (JSON), jamais en dur.
- **Les zones sont des polygones PostGIS** dans la table `zones`. Un point est rattaché à une zone avec `ST_Covers`. Rien de géographique en dur dans le code.
- Les appels Google payants passent **par des Edge Functions** (clé serveur jamais dans les apps), avec cache. Voir `docs/GOOGLE_MAPS.md`.
- « Je suis arrivé » (coursier) est validé côté serveur : GPS à moins de 100 m du point.
- **Row Level Security activée sur toutes les tables.** Un client ne voit que ses courses ; un coursier ne voit que les courses qui lui sont proposées ou assignées ; seul `admin` voit tout.
- Changements de statut atomiques (transaction + `SELECT … FOR UPDATE`), chaque changement journalisé dans `delivery_events`.
- Migrations SQL versionnées dans `supabase/migrations/`. Jamais de modification manuelle du schéma. Seed dans `supabase/seed.sql`.
- Validation des entrées avec Zod (`packages/shared`), côté app ET côté Edge Function.
- Montants en **entiers** (pas de décimales) + code devise (`XOF` Togo, `XAF` Tchad). Ne jamais additionner deux devises.
- Pays, devise, indicatif, tarifs, zones, moyens de paiement : tables `countries` / `cities` / `zones`.
- Textes UI en français via i18n (`packages/shared/i18n/fr.json`). Prévoir l'arabe tchadien plus tard (RTL non requis au MVP).
- **Pensé pour la 3G instable et les téléphones d'entrée de gamme** (Tecno, Infinix, Itel) : états de chargement, retries avec backoff, file d'attente locale des positions GPS, payloads légers, images compressées, APK le plus léger possible, pas d'animation coûteuse.

## Design system (Uber-like, identité propre)
- Fond blanc, texte quasi noir `#111`, gris `#6B6B6B`, séparateurs `#EEE`
- Couleur d'accent : à définir (placeholder `#00A86B`), utilisée avec parcimonie (CTA principal, statut actif)
- Couleurs de zone (carte admin et app coursier) : Zone 1 et Zone 2 doivent être distinguables, définies dans `zones.color`
- Typo : Inter (ou système). Titres 24–28 gras, corps 16, légendes 13
- Écran principal = carte plein écran + bottom sheet arrondi (radius 16) avec la prochaine action
- Boutons CTA pleine largeur, hauteur 56, radius 12. Une seule action principale par écran.

## Commandes
- `pnpm dev:client` / `pnpm dev:courier` / `pnpm dev:web`
- `supabase start` puis `supabase db reset` (rejoue migrations + seed)
- `pnpm test` (Vitest pour shared/web/fonctions, Jest pour RN)
- `pnpm typecheck` et `pnpm lint` doivent passer avant de dire qu'une tâche est finie
- `eas build -p android --profile apk` (client ou coursier) — voir `docs/DISTRIBUTION.md`

## Façon de travailler
- Avance phase par phase (`docs/PROMPTS.md`). Commence chaque phase par un plan court que je valide.
- Fin de phase : typecheck + lint + tests, puis résumé en français simple de ce qui est fait, de ce que je dois tester sur mon téléphone, et de ce qui reste.
- Ne commite jamais de clé ni de secret. Mets à jour `.env.example` quand tu ajoutes une variable.
- Ne supprime jamais le keystore Android ni les credentials EAS.
