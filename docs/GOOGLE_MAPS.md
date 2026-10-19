# Google Maps Platform — ce qu'on utilise et comment

Les APIs Google sont facturées à l'usage. Règle d'or : **Google pour ce que seul Google sait faire (recherche de lieux, itinéraires) ; PostGIS pour tout le reste** (zones, distances de tri, rayon de recherche).

Avant de coder, vérifier sur la documentation Google les noms exacts des APIs et la tarification en vigueur : Google a renommé plusieurs produits (APIs « New », Routes API qui remplace Directions / Distance Matrix).

## Fonctions et API correspondante
| Besoin | API Google | Où | Appelée quand |
|---|---|---|---|
| Afficher la carte (app Android) | Maps SDK for Android (via `react-native-maps`) | client, coursier | chargement de la carte |
| Afficher la carte (PWA, admin, suivi destinataire) | Maps JavaScript API | web | chargement de la page |
| Chercher une adresse / un lieu | Places API (New) — Autocomplete | via Edge Function `places-autocomplete` | frappe du client (debounce 350 ms, 3 caractères min.) |
| Détail du lieu choisi (coordonnées, **types** pour détecter un restaurant) | Places API (New) — Place Details, champs limités (`location`, `displayName`, `types`, `formattedAddress`) | Edge Function `place-details` | 1 fois par lieu choisi |
| Épingle posée à la main → nom approximatif | Geocoding API (reverse) | Edge Function `reverse-geocode` | quand l'épingle s'arrête |
| Restaurant à moins de 50 m d'une épingle | Places API (New) — Nearby Search, types restaurant/café/bar/meal_takeaway/bakery | Edge Function, à la commande seulement | création de course avec épingle manuelle |
| Distance et durée du trajet (prix) | Routes API — computeRoutes, mode deux-roues si disponible sur Lomé, sinon voiture | Edge Function `quote` | devis (cache 10 min) |
| Distance d'approche du coursier qui accepte (incitation) | Routes API — computeRoutes | Edge Function `accept-offer` | 1 fois par course |
| Navigation du coursier | **Aucune API** : lien profond vers l'app Google Maps (`https://www.google.com/maps/dir/?api=1&destination=lat,lng&travelmode=two-wheeler`) | coursier | bouton « Itinéraire » |

Ce qui **ne passe pas** par Google : rattachement à une zone, classement des coursiers par distance, rayon de recherche, détection d'arrivée (< 100 m), vérification de couverture → tout en PostGIS.

## Spécificités Lomé
- Restreindre l'autocomplétion au pays (`includedRegionCodes: ["tg"]`) et biaiser vers le centre de la ville active (`locationBias` cercle ~15 km). Pour N'Djamena : `td`.
- Beaucoup de rues sans nom et de lieux absents de Google : le **repère texte reste obligatoire**, l'épingle est toujours déplaçable, et l'app propose les **lieux récents et favoris** du client avant toute recherche Google (gratuit et souvent plus juste).
- Les types Google pour les petits maquis sont incomplets : la table `venues` (admin) complète la détection des restaurants.

## Clés API (3 clés séparées)
| Clé | Restriction | Utilisée par |
|---|---|---|
| `GOOGLE_MAPS_ANDROID_KEY` | Application Android : nom de package + empreinte SHA-1 du **certificat de signature EAS** (celui de l'APK distribué, pas celui du debug) | `app.config.ts` client et coursier |
| `NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY` | Référents HTTP : notre domaine uniquement ; API limitée à Maps JavaScript | site, PWA, admin |
| `GOOGLE_MAPS_SERVER_KEY` | APIs limitées à Places, Geocoding, Routes. Stockée en secret Supabase, jamais dans une app | Edge Functions |

## Maîtrise des coûts
- **Session tokens** sur l'autocomplétion (une session = frappe + Place Details du lieu choisi).
- Place Details avec **masque de champs minimal** (le prix dépend des champs demandés).
- Cache en base : `geo_cache` (clé = requête normalisée ou place_id, valeur JSON, expiration 30 jours pour les lieux, 10 min pour les itinéraires).
- Lieux récents / favoris du client stockés chez nous (`saved_places`) : zéro appel Google quand il les réutilise.
- Pas d'appel Routes pour classer les coursiers (PostGIS).
- Rate limiting par utilisateur sur les Edge Functions Google (ex. 60 requêtes d'autocomplétion / minute).
- Dans Google Cloud : **alerte budget** mensuelle et **quotas journaliers** par API, pour qu'un bug ne coûte pas une fortune.
- Tableau admin : nombre d'appels Google par jour et par API (compteur dans `geo_calls_log`).

## Edge Functions Google (toutes derrière auth Supabase)
- `places-autocomplete` (input, sessionToken, cityId) → suggestions
- `place-details` (placeId, sessionToken) → { lat, lng, name, address, types, isRestaurant }
- `reverse-geocode` (lat, lng) → { label }
- `route` (from, to) → { distance_m, duration_s } — usage interne par `quote` et `accept-offer`
Toutes : validation Zod, cache `geo_cache`, log `geo_calls_log`, timeout 5 s, réponse dégradée propre si Google ne répond pas (ex. distance à vol d'oiseau × 1,3 pour le devis).
