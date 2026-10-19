# Zones de Lomé et attribution des courses

## Pourquoi
Découper Lomé en 2 grandes zones pour :
- que les coursiers d'une zone répondent en priorité aux courses de leur zone (moins d'approche, attente plus courte) ;
- gérer les coursiers par zone (effectifs, présence, performance) ;
- voir en un coup d'œil où il manque des coursiers.

## Les 2 zones (lancement)
Les limites exactes sont **dessinées dans l'admin** sur la carte, pas écrites dans le code. Liste de départ des quartiers donnée par l'équipe :

| Zone | Nom provisoire | Quartiers de départ |
|---|---|---|
| Zone 1 | Lomé Sud & Est | Centre-ville, Bè, Baguida, Akodésséwa, Léo 2000, etc. |
| Zone 2 | Lomé Nord & Ouest | Agoè-Zanguéra, Adidogomé, Djidjolé, « CB » (à préciser), etc. |

Les limites définitives seront **dessinées par l'équipe dans l'admin**. Le seed ne contient que des polygones provisoires grossiers.

## Modèle de données
- `zones` : `id`, `city_id`, `code` (`LOME_Z1`, `LOME_Z2`), `name`, `color`, `area geography(MultiPolygon,4326)`, `active`, `allow_overflow` (bool), `created_at`
- `zone_neighborhoods` : `zone_id`, `name` — liste lisible des quartiers (affichage et recherche, pas utilisée pour le calcul)
- `couriers.home_zone_id` : zone d'attache, fixée par l'admin à la validation du coursier
- `deliveries.pickup_zone_id`, `deliveries.dropoff_zone_id` : calculés serveur à la commande et figés
- Index GiST sur `zones.area` et `couriers.position`

Rattacher un point à une zone : `SELECT id FROM zones WHERE city_id = $1 AND active AND ST_Covers(area, $point)`. Si un point tombe exactement sur une frontière commune, prendre la zone de plus petit `code`.

## Couverture
- Zone de service de la ville = union des zones actives.
- Point de récupération **hors de toute zone** → la commande est refusée avec un message clair : « Nous ne livrons pas encore ici. »
- Point de livraison **hors zone** → refusé aussi au MVP (paramètre `cities.pricing.allow_dropoff_outside` pour assouplir plus tard).
- Une course **peut traverser les zones** (récupération en Zone 1, livraison en Zone 2). Elle appartient à la **zone de récupération**.

## Attribution d'une course (matching par zone)
La course est proposée par **vagues** ; chaque offre dure 20 s ; refus ou silence = coursier suivant.
Candidats toujours : validés, non bloqués, en ligne, sans course en cours, position reçue il y a moins de 2 min.

| Vague | Qui | Ordre |
|---|---|---|
| 1 | Coursiers **d'attache** de la zone de récupération, **présents dans cette zone** | du plus proche au plus loin |
| 2 | Tout coursier **présent** dans la zone de récupération (ex. un coursier de Zone 2 qui vient de livrer en Zone 1) | du plus proche |
| 3 | Débordement : coursiers de l'autre zone à moins de 3 km du point de récupération, si `zones.allow_overflow` | du plus proche |

- Passage à la vague suivante : quand la vague est épuisée, ou après 90 s sans preneur.
- Après 3 min sans preneur au total : course `unassigned`, le client est prévenu, l'admin voit une alerte sur la zone.
- Pas de limite de distance dans les vagues 1 et 2 (la zone fait déjà le tri). L'incitation à la course (bonus au-delà de 2 km d'approche, voir `MVP.md`) s'applique normalement.
- Tri par distance à vol d'oiseau (PostGIS `ST_Distance`) pour choisir l'ordre — **pas d'appel Google** pour classer les candidats. La distance routière d'approche n'est calculée qu'une fois, pour le coursier qui accepte.
- Attribution atomique : une course ne peut être acceptée que par un seul coursier (`UPDATE … WHERE status = 'searching' RETURNING`).

## Côté coursier
- Le coursier voit sa zone d'attache et la carte de sa zone (contour coloré).
- Il peut se mettre en ligne partout dans la ville. S'il est hors de sa zone d'attache, un bandeau l'indique : « Vous êtes hors de votre zone : vous recevrez moins de courses. »
- Après une livraison dans l'autre zone, il reçoit les courses de cette zone en vague 2 ; il n'est pas obligé de rentrer à vide.

## Côté admin
- Carte avec les 2 polygones colorés, **modifiables** (déplacer les sommets, redessiner). Outil de dessin conseillé : `terra-draw` sur Maps JavaScript API. Ne pas utiliser la Drawing Library de Google (dépréciée).
- Import / export GeoJSON des zones (sauvegarde, et pour reprendre un découpage préparé ailleurs).
- Tableau par zone, en direct : coursiers en ligne (d'attache / présents), courses en attente, temps moyen d'attribution, courses non attribuées du jour.
- Alerte quand une zone a des courses en attente et aucun coursier disponible.
- Changer la zone d'attache d'un coursier.

## Évolutions possibles (pas au MVP)
- Plus de 2 zones, ou zones différentes selon l'heure.
- Tarif inter-zones.
- Mode « retour vers ma zone » : proposer en priorité au coursier des courses qui le ramènent chez lui.
