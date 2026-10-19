# Prompts à donner à Claude Code, phase par phase

## Mode d'emploi
1. Suis d'abord `docs/DEMARRAGE.md` (comptes, clés, installations).
2. Dans le dossier du projet (celui qui contient `CLAUDE.md`), ouvre un terminal et lance `claude`.
3. Colle **un prompt à la fois**. Avant qu'il code, appuie sur Shift+Tab pour passer en mode plan et valide son plan.
4. À la fin de chaque phase : teste sur ton téléphone Android, puis `git commit`. Ne passe à la suivante que si la phase marche.
5. Si quelque chose ne va pas, décris ce que tu vois (avec une capture d'écran glissée dans le terminal).

---

## Phase 0 — Squelette
```
Lis CLAUDE.md et tous les fichiers de docs/. Crée le monorepo décrit dans CLAUDE.md :
pnpm + Turborepo, apps/client et apps/courier en Expo Router (TypeScript), apps/web en Next.js + Tailwind,
packages/shared et packages/ui. ESLint, Prettier, tsconfig strict partagé, .gitignore, .env.example complet
(reprends celui de la racine), scripts pnpm dev:client / dev:courier / dev:web / typecheck / lint / test.
Initialise Supabase en local (supabase init) avec PostGIS activé.
Configure eas.json avec les profils development, preview et apk pour les deux apps, et les identifiants
tg.koursa.client et tg.koursa.courier. Chaque app affiche un écran "Hello Koursa" qui tourne.
Aucune fonctionnalité métier.
```

## Phase 1 — Base de données
```
Crée les migrations Supabase pour tout le modèle de données de docs/MVP.md section 7, docs/ZONES.md,
docs/GOOGLE_MAPS.md et docs/DISTRIBUTION.md. PostGIS, index GiST, RLS sur toutes les tables avec des
policies strictes par rôle. cities.pricing contient tous les paramètres de prix, incitation, attente et
pénalité de docs/MVP.md section 5 avec les valeurs indiquées.
Seed : Togo/Lomé (XOF, +228) et Tchad/N'Djamena (XAF, +235, inactive). Pour Lomé, 2 zones LOME_Z1 et
LOME_Z2 avec des polygones PROVISOIRES grossiers (je les redessinerai dans l'admin) et leurs quartiers
de départ ; 1 admin, 2 clients, 6 coursiers validés (3 par zone, positionnés dans leur zone).
Fonction SQL zone_of(city_id, point) et tests : un point dans chaque zone, un point hors zone.
Génère les types TypeScript Supabase dans packages/shared.
Tests RLS : un client ne lit pas les courses d'un autre ; un coursier ne lit pas une course qui ne lui est pas proposée.
```

## Phase 2 — Design system + connexion
```
Dans packages/ui, crée les composants du design system de CLAUDE.md : Button, Input, PhoneInput
(indicatif lu depuis countries), BottomSheet, Avatar, StatusPill, MapPin, Timer, ZoneBadge.
Puis l'authentification par OTP SMS (Supabase Auth phone) dans les deux apps et dans la PWA :
numéro → code à 6 chiffres → nom (première fois). Session persistée. Textes via i18n fr.json.
Vérifie que l'export web de apps/client fonctionne (expo export -p web).
```

## Phase 3 — Couche Google Maps
```
Implémente docs/GOOGLE_MAPS.md : les Edge Functions places-autocomplete, place-details,
reverse-geocode et route, avec la clé serveur en secret Supabase, validation Zod, cache geo_cache,
log geo_calls_log, rate limiting, timeout et réponse dégradée. Autocomplétion restreinte au pays de la
ville et biaisée sur son centre. place-details renvoie isRestaurant (types Google + table venues).
Côté apps : composant AddressSearch (lieux récents/favoris d'abord, puis Google, session tokens) et
composant carte avec épingle déplaçable + reverse geocode. Carte Android avec la clé Android,
carte web avec la clé web. Tests des fonctions avec Google simulé (mock).
```

## Phase 4 — App client : créer une course
```
App client : accueil carte plein écran + bottom sheet "Où livrer ?". Flux de création de docs/MVP.md
section 3 : récupération → livraison → repère obligatoire → destinataire → taille → qui paie →
récapitulatif avec prix et la ligne "5 min d'attente offertes, puis 50 F/min".
Edge Function quote : vérifie que les deux points sont dans une zone (zone_of), sinon erreur
"Nous ne livrons pas encore ici" ; calcule le prix avec exactement la formule de docs/MVP.md
section 5 (distance via la fonction route). Logique de prix pure dans packages/shared + tests :
5 km et 6 km taille Petit, minimum, coefficient Grand, arrondi à la centaine.
Edge Function create_delivery : recalcule tout côté serveur, fige price_locked, pickup_zone_id,
dropoff_zone_id, pickup_grace_min (5, ou 15 si restaurant — jamais renvoyé au client),
crée la course en searching et enregistre le lieu dans saved_places.
```

## Phase 5 — App coursier + attribution par zone
```
App coursier : inscription avec upload des documents (Supabase Storage), écran "en attente de
validation", affichage de la zone d'attache, toggle En ligne / Hors ligne avec position toutes les
10 s (service au premier plan Android, file d'attente locale si pas de réseau), bandeau hors zone,
écran d'aide économiseur de batterie.
Implémente l'attribution par vagues de docs/ZONES.md (vague 1 coursiers d'attache présents dans la zone,
vague 2 tout coursier présent dans la zone, vague 3 débordement à 3 km), offres de 20 s, passage de
vague, unassigned après 3 min, alerte admin. Offre plein écran via Supabase Realtime + notification FCM.
Acceptation atomique ; à l'acceptation, calcule la distance d'approche routière (fonction route) et
la stocke. Tests de l'algorithme de vagues avec des coursiers simulés dans les 2 zones.
```

## Phase 6 — Déroulé de la course, attente, suivi
```
Côté coursier : étapes de docs/MVP.md (Je suis arrivé validé serveur si GPS < 100 m, colis récupéré,
en route, je suis arrivé, code à 4 chiffres, livré), bouton Itinéraire (lien Google Maps deux-roues),
appeler, signaler un incident, client absent après le plafond d'attente.
À la validation de la livraison : écran "Montant à encaisser" en grand, calculé serveur selon docs/MVP.md
(qui paie la course, attente à la récupération, attente à la livraison payée par le destinataire),
avec le détail, et la case "Frais d'attente refusés".
Minuteurs d'attente aux deux points selon pickup_grace_min / dropoff_grace_min, 50 F/min, plafond 15 min,
calculés côté serveur à partir des horodatages. Le coursier voit la vraie tolérance ; le client voit
"Votre coursier est arrivé" puis le compteur seulement quand les frais commencent.
Côté client : suivi temps réel de la position du coursier, statut, infos coursier.
Code de livraison généré serveur (stocké hashé), envoyé au destinataire par SMS avec le lien /t/[token]
(page publique minimale dans apps/web, avec le compteur d'attente si besoin).
Chaque changement de statut passe par une fonction serveur et est journalisé dans delivery_events.
```

## Phase 7 — Argent
```
À la livraison : commission de 18 % (taux de la ville) sur le prix ET sur les frais d'attente, écriture
dans wallet_transactions, mise à jour du solde dû, blocage automatique au-delà du seuil.
Job quotidien (pg_cron) : crédite l'incitation à la course de la veille (95 F/km au-delà de 2 km
d'approche, plafond 500 F). Pénalité de retard selon docs/MVP.md section 5 (sauf incident validé), versée à l'entreprise
(ajoutée à la dette du coursier). Admin : total pénalités vs total incitations du mois.
App coursier : écran Gains (jour/semaine, détail courses / attente / incitations / pénalités) et
Commission due avec instructions de remboursement mobile money.
App client : historique, notation du coursier.
Tests : un cas complet de course avec attente aux deux points, incitation et pénalité, montants vérifiés au franc près,
pour les deux cas de payeur (expéditeur / destinataire).
```

## Phase 8 — Back-office
```
apps/web /admin protégé (rôle admin uniquement) :
- Zones : carte Maps JavaScript avec les 2 polygones colorés, édition avec terra-draw, import/export
  GeoJSON, zone d'attache des coursiers, tableau en direct par zone, alertes de zone vide.
- Coursiers : validation avec les documents, suspension, zone d'attache.
- Carte live des coursiers et courses, colorés par zone. Liste des courses filtrable (zone, statut, date).
- Tarification par ville : tous les champs de cities.pricing, avec un aperçu du prix pour 3, 6 et 10 km.
- Lieux spéciaux (restaurants) : liste, ajout, retrait, signalements coursiers, attente moyenne mesurée.
- Remboursements de commission (débloque le coursier), incidents à valider, litiges.
- Versions des apps (app_versions) et compteur des appels Google.
- Indicateurs de docs/MVP.md section 8, par zone.
```

## Phase 9 — Site et distribution hors stores
```
Implémente docs/DISTRIBUTION.md :
- apps/web : pages /, /telecharger (détection Android / iPhone / ordinateur, QR code, version, taille,
  SHA-256), /coursiers, mentions légales, confidentialité.
- PWA : manifest, icônes, service worker, export web de apps/client servi sous /app, instruction iPhone
  "Partager → Sur l'écran d'accueil", Web Push.
- Vérification de version au démarrage des deux apps (app_versions : écran bloquant sous min_version,
  bandeau sous latest_version, bouton qui ouvre l'URL de l'APK).
- EAS Update configuré sur le canal production.
- Script pnpm release:android qui construit l'APK (profil apk), calcule le SHA-256, l'envoie dans
  Supabase Storage (bucket downloads) et prépare la ligne app_versions.
- README de déploiement : Supabase production, secrets, domaine, Vercel, sauvegarde du keystore EAS.
```

## Phase 10 — Robustesse 3G et lancement
```
Passe en revue les deux apps et la PWA pour une connexion 3G instable et un téléphone d'entrée de gamme :
états de chargement, retries, file d'attente des positions, messages d'erreur clairs en français,
taille de l'APK. Ajoute Sentry. Vérifie toutes les policies RLS et les Edge Functions : un utilisateur ne
doit jamais pouvoir modifier un prix, un statut, une zone ou un montant. Liste-moi ce qu'il faut tester
sur le terrain avec les coursiers pilotes.
```

---

## Prompts utiles à tout moment
- `Lance typecheck, lint et tests, et corrige ce qui casse.`
- `Explique-moi simplement ce que tu viens de faire et ce que je dois tester sur mon téléphone.`
- `Voici une capture d'écran : rapproche cet écran du design system de CLAUDE.md.`
- `Revois la sécurité : RLS, Edge Functions, et tout endroit où un utilisateur pourrait modifier un prix, un statut ou une zone.`
- `Combien d'appels Google cette fonction fait-elle par course ? Réduis-les.`
