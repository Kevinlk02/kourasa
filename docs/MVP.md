# MVP — Koursa (nom provisoire)

## 1. Le produit en une phrase
Envoyer un colis d'un point A à un point B dans la ville, avec un coursier à moto, en quelques taps. Lancement à Lomé (2 zones), puis N'Djamena. Apps téléchargées depuis notre site, sans passer par les stores.

## 2. Les 3 utilisateurs
| Qui | App | Ce qu'il veut |
|---|---|---|
| **Expéditeur** (particulier, boutique, restaurant, vendeur en ligne) | `client` (APK Android ou PWA iPhone) | Envoyer vite, connaître le prix avant, suivre le coursier |
| **Coursier** (moto) | `courier` (APK Android) | Recevoir les courses de sa zone, savoir combien il gagne |
| **Admin** (toi / ton équipe) | `web` → `/admin` | Valider les coursiers, gérer les 2 zones, voir l'activité, régler les prix |

Le **destinataire** n'a pas besoin de l'app : il reçoit un lien de suivi (SMS/WhatsApp) et un code de réception.

## 3. Périmètre MVP (V1)

### App expéditeur
1. **Connexion par numéro de téléphone** (OTP SMS). Indicatif auto selon le pays (+228 / +235).
2. **Écran d'accueil** : carte plein écran centrée sur la position, bottom sheet « Où livrer ? ».
3. **Créer une course**
   - Point de récupération : position actuelle, **lieux récents / favoris**, recherche Google, ou épingle déplacée sur la carte
   - Le serveur vérifie que les deux points sont dans une zone desservie, sinon message « Nous ne livrons pas encore ici »
   - Point de livraison : idem
   - **Repère obligatoire** (texte libre : « portail bleu derrière la pharmacie X ») — les adresses sont peu fiables, c'est le repère qui fait la livraison
   - Nom + téléphone du destinataire
   - Taille du colis : Petit (enveloppe/sac) · Moyen (carton) · Grand (gros carton, limite moto)
   - Qui paie : l'expéditeur ou le destinataire
4. **Prix affiché avant validation** (calculé serveur, figé). Ligne visible : « 5 min d'attente offertes, puis 50 F/min ».
5. **Recherche de coursier** : animation d'attente, annulation possible gratuite tant que personne n'a accepté.
6. **Notification « Votre coursier est arrivé »** et compteur des frais d'attente quand ils commencent.
7. **Suivi en temps réel** : position du coursier sur la carte, statut, bouton appeler le coursier, photo + nom + plaque.
8. **Code de livraison à 4 chiffres** envoyé au destinataire ; le coursier le saisit pour clôturer.
9. **Historique** des courses + **note** du coursier (1–5 étoiles).

### App coursier
1. Inscription : téléphone, nom, photo, photo pièce d'identité, photo moto + plaque, permis. Statut « en attente de validation ».
2. Sa **zone d'attache** affichée (contour coloré sur la carte). Bouton **En ligne / Hors ligne** (position envoyée toutes les ~10 s quand en ligne). Bandeau s'il est hors de sa zone.
3. **Proposition de course** plein écran : zone, distance jusqu'au pickup, trajet, gain, 20 s pour accepter.
4. Déroulé en étapes : En route vers le pickup → **Je suis arrivé** (GPS < 100 m, lance le minuteur d'attente) → Colis récupéré (photo optionnelle) → En route vers la livraison → **Je suis arrivé** → Saisie du code → Livré. Bouton « Signaler un incident » (panne, accident, contrôle).
5. Bouton « Itinéraire » qui ouvre l'app Google Maps (pas de GPS intégré au MVP).
6. **Gains du jour / de la semaine** (courses, frais d'attente, incitations, pénalités) et **commission due** à la plateforme.
7. Signaler qu'un lieu est un restaurant.
8. Écran d'aide « désactiver l'économiseur de batterie » (Tecno / Infinix / Itel).

### Back-office admin (web)
1. Valider / suspendre les coursiers (voir les documents).
2. **Zones** : carte des 2 zones de Lomé, polygones modifiables, import/export GeoJSON, zone d'attache des coursiers, tableau en direct par zone (voir `ZONES.md`).
3. Carte en direct : coursiers en ligne + courses en cours, colorés par zone.
4. Liste des courses avec filtres (ville, zone, statut, date).
5. **Tarifs par ville** modifiables : prix du carburant, coût moto/km, rémunération visée, marge (18 %), minimum, coefficients de taille, approche incluse (2 km), bonus d'approche (95 F/km, plafond 500 F), attente (5 min / 15 min restaurant, 50 F/min, plafond 15 min), règle de pénalité de retard.
6. **Lieux spéciaux (restaurants)** : liste, ajout/retrait, validation des signalements coursiers, temps d'attente moyen mesuré par lieu.
7. Seuil de blocage des coursiers.
8. **Versions des apps** : publier un nouvel APK (lien, version, version minimale, notes).
9. Suivi des appels Google par jour (coût).
10. Gestion des litiges simple : incidents de retard à valider, annuler, rembourser manuellement, commentaire.

## 3 bis. Plateformes
**Pas de Play Store, pas d'App Store.** Tout se télécharge depuis notre site (détail : `DISTRIBUTION.md`).
- **Android** : APK client et APK coursier, téléchargés sur le site.
- **iPhone** : app client en PWA (« ajouter à l'écran d'accueil »). L'app coursier n'existe pas sur iPhone (Apple n'autorise pas l'installation hors App Store) : les coursiers sont sur Android.
- **Site** : accueil, `/telecharger`, `/coursiers`, PWA, suivi destinataire, back-office.

## 4. Hors MVP (V2+)
Paiement mobile money intégré · livraison programmée · multi-colis / tournées · comptes boutiques avec API · livraison de repas · chat in-app · parrainage · arabe tchadien · tricycles/voitures.

## 5. Règles métier clés

### Prix : tarification au km, garantie (décision validée)
Toutes les valeurs ci-dessous sont **en base** (table `cities.pricing`), modifiables dans l'admin, jamais en dur.

**Coût de revient** (sert à calibrer, n'est pas affiché) :
- coût moto par km = consommation (L/km) × prix du carburant + usure/entretien. Hypothèse prudente : 95 F/km. Le prix du carburant est un champ de la ville : s'il change, on modifie un seul chiffre.
- rémunération visée du coursier : 1 200 F/heure.

**Prix client** :
```
coût_course = (km_route + 2 km d'approche inclus) × coût_moto_km
            + (temps_trajet au trafic moyen + 5 min de remise) × rémunération/min
prix = coût_course ÷ (1 − marge)
prix = max(prix, minimum)            -- minimum 700 F
prix = prix × coef_taille            -- Petit 1 · Moyen 1,2 · Grand 1,5
prix = arrondi à la centaine supérieure
```
- **Marge plateforme : 18 %.** Le coursier garde 82 % du prix.
- Distance = trajet routier (Google Routes API, voir `GOOGLE_MAPS.md`). À défaut : vol d'oiseau × 1,3.
- Le temps réel n'entre **pas** dans le prix : le trafic moyen est déjà compté. Pas de tarification au temps (le prix final serait incertain).
- **Le prix affiché = le prix payé.** Il est calculé serveur à la commande, figé dans la course (`price_locked`), et ni le client ni le coursier ne peuvent le modifier.

Seuls ajouts possibles au prix, tous annoncés dans le récapitulatif avant validation : frais d'attente (ci-dessous) et nouveau prix si le client change l'adresse en cours de route (qu'il doit accepter).

### Incitation à la course (bonus d'approche)
- Jusqu'à **2 km** entre le coursier et le colis : inclus dans le prix, rien de plus.
- Au-delà : le coursier reçoit un bonus de **95 F par km supplémentaire, plafonné à 500 F par course**, versé le lendemain sur son portefeuille (crédit qui réduit sa dette de commission).
- Payé **par la plateforme**, sur sa marge. Le client ne voit rien et ne paie rien de plus.
- La distance d'approche est mesurée au moment où le coursier accepte (sa position → point de récupération, distance routière).
- Effet attendu : marge réelle ≈ 15 % (18 % − environ 3 points d'incitations).

### Frais d'attente
- Le minuteur démarre quand le coursier tape « Je suis arrivé ». Ce bouton n'est actif que si son GPS est **à moins de 100 m** du point.
- Au point de récupération et au point de livraison :
  - **5 minutes offertes**, puis **50 F/min**, plafonné à **15 minutes payantes (750 F)**.
  - Au-delà du plafond, le coursier peut déclarer « client absent » : annulation avec frais (récupération) ou retour à l'expéditeur avec frais de retour (livraison).
- **Restaurants (règle interne, non affichée au client)** : si le point de récupération est un restaurant, maquis, café, bar, fast-food ou boulangerie, **15 minutes offertes** au lieu de 5. Détection, côté serveur à la création de la course :
  1. type Google Places du lieu choisi (`restaurant`, `cafe`, `bar`, `meal_takeaway`, `bakery`…) ;
  2. si épingle posée à la main : un lieu de ces types à moins de 50 m ;
  3. table `venues` gérée dans l'admin (ajout/retrait manuel, signalement par les coursiers à valider).
  La tolérance retenue est figée dans la course (`pickup_grace_min`).
- Affichage : le client voit « Votre coursier est arrivé », puis le compteur payant seulement quand les frais commencent. Le coursier voit la vraie règle (« Restaurant : 15 min avant facturation »).
- Les frais d'attente sont **partagés comme une course : 82 % coursier, 18 % plateforme**.
- **Qui paie l'attente** : au point de récupération, l'expéditeur ; au point de livraison, **le destinataire**.
- **Encaissement à la fin de la course** : quand le coursier valide la livraison, l'app calcule le **montant total à encaisser** et l'affiche en grand au coursier (et sur le lien de suivi du destinataire) :
  - si le destinataire paie la course : prix de la course + attente à la récupération + attente à la livraison ;
  - si l'expéditeur a payé la course à la récupération : il a réglé prix + attente à la récupération ; le destinataire paie en cash **seulement l'attente à la livraison**.
  - Le détail (course / attente) est toujours visible pour éviter les disputes.
- Si le destinataire refuse de payer l'attente : le coursier coche « Frais d'attente refusés », la livraison est quand même clôturée, et l'admin traite le cas (le coursier n'est pas pénalisé).
- Chaque attente réelle est enregistrée par lieu, pour ajuster plus tard la tolérance restaurant par restaurant.

### Retard du coursier (pénalité)
- Décision : un retard important **dû au coursier** est payé par le coursier.
- Proposition de règle, à valider :
  - délai promis = temps de trajet estimé × 1,5 + 10 min, compté à partir de la récupération ;
  - les temps d'attente imputables au client ne comptent pas ;
  - au-delà, pénalité de 50 F/min, plafonnée à 30 % de la part du coursier ;
  - pas de pénalité si le coursier a déclaré un incident (panne, accident, contrôle) validé par l'admin.
- **La pénalité revient à l'entreprise**, pas au client. Elle s'ajoute à la dette de commission du coursier.
- Ces pénalités alimentent le financement des **incitations à la course** (suivi dans l'admin : total pénalités du mois vs total incitations du mois).

### Zones et attribution des courses
Lomé est découpée en **2 zones**. Une course appartient à la zone de son point de récupération et est proposée d'abord aux coursiers d'attache de cette zone, puis aux coursiers présents dans la zone, puis (débordement) aux coursiers proches de l'autre zone. Règles complètes : `ZONES.md`.

### Argent au MVP : cash + commission
- Le coursier encaisse en espèces le montant total affiché par l'app (prix + frais d'attente éventuels). La plateforme prend 18 % (configurable par ville).
- Chaque course livrée crée une **dette de commission** dans le portefeuille du coursier. Les incitations à la course réduisent cette dette ; les pénalités de retard l'augmentent.
- Au-delà d'un seuil (ex. 5 000 F), le coursier est **bloqué** jusqu'à ce qu'il rembourse (par mobile money vers ton numéro marchand, validé à la main dans l'admin).
- Ça te permet de lancer **sans dépendre d'un agrégateur de paiement** dès le jour 1.

### Statuts d'une course
`pending → searching → assigned → picked_up → delivering → delivered`
Sorties : `cancelled_by_client`, `cancelled_by_courier`, `unassigned`, `failed` (destinataire injoignable → retour expéditeur).

## 6. Multi-pays dès le départ
| | Togo | Tchad |
|---|---|---|
| Ville MVP | Lomé | N'Djamena |
| Devise | XOF (zone UEMOA) | XAF (zone CEMAC) |
| Indicatif | +228 | +235 |
| Mobile money (V2) | Flooz (Moov Africa), Mixx by Yas (ex-T-Money) | Airtel Money, Moov Money |

Les deux pays sont dans **deux zones monétaires différentes** : ne jamais additionner des montants XOF et XAF, et prévoir des comptes marchands distincts.

**Paiement en V2** : passer par une couche `PaymentProvider` abstraite pour pouvoir brancher un agrégateur par pays (ex. PayDunya côté Togo, CinetPay ou intégration directe Airtel/Moov côté Tchad). Vérifier la couverture réelle et la fiabilité de chaque agrégateur avant de signer.

## 7. Modèle de données (tables principales)
- `countries` (code, nom, devise, indicatif, actif)
- `cities` (pays, nom, centre géo, `pricing` JSON, actif)
- `zones`, `zone_neighborhoods` (voir `ZONES.md`)
- `profiles` (id = auth.users, rôle client|courier|admin, nom, téléphone, ville)
- `couriers` (profil, statut validation, documents, véhicule, plaque, **home_zone_id**, en_ligne, position `geography(Point)`, last_seen, note moyenne, bloqué)
- `courier_wallets` (coursier, solde_du, devise)
- `wallet_transactions` (coursier, type commission|incitation|attente|penalite|remboursement|ajustement, montant, course)
- `deliveries` (client, coursier, ville, statut, pickup/dropoff point + adresse + repère + place_id + types Google, **pickup_zone_id, dropoff_zone_id**, destinataire nom/tél, taille, payeur, distance_m, approche_m, price_locked, commission, devise, code_hash, pickup_grace_min, dropoff_grace_min, arrivé_pickup_at, arrivé_dropoff_at, frais_attente_pickup, frais_attente_dropoff, attente_refusee, montant_total_encaisse, bonus_approche, penalite_retard, timestamps de chaque étape)
- `venues` (place_id ou point, nom, type, est_restaurant, source google|admin|coursier, validé, temps d'attente moyen mesuré)
- `delivery_offers` (course, coursier, envoyée_le, réponse, répondu_le)
- `delivery_events` (journal des changements de statut)
- `ratings` (course, note, commentaire)
- `courier_locations` (historique léger pendant une course, pour le tracking)
- `saved_places` (client, nom, point, repère, place_id) — lieux récents et favoris
- `geo_cache`, `geo_calls_log` (voir `GOOGLE_MAPS.md`)
- `app_versions` (voir `DISTRIBUTION.md`)

## 8. Indicateurs à suivre dès le lancement
Tout par zone : courses créées / livrées · temps moyen d'attribution · marge réelle après incitations · coût des incitations · frais d'attente encaissés · attente moyenne par restaurant · retards coursiers · taux de courses non attribuées · délai moyen de livraison · coursiers actifs par jour · commissions dues vs récupérées.

## 9. Ce qu'il te faut avant de coder
Voir `DEMARRAGE.md` (comptes, installations, ordre des étapes).
- Côté terrain : 10–20 coursiers pilotes répartis sur les 2 zones de Lomé avant d'ouvrir N'Djamena.
- Côté légal : structure enregistrée dans chaque pays avant d'encaisser de l'argent ; mentions légales et politique de confidentialité sur le site.

## 10. Points encore ouverts
- Les limites des 2 zones de Lomé seront **dessinées par l'équipe dans l'admin** : les polygones du seed sont provisoires.
- Paramètres exacts de la pénalité de retard (délai × 1,5 + 10 min, 50 F/min, plafond 30 %) à confirmer après le premier mois de terrain.
- Coût réel par km à vérifier avec les coursiers (95 F/km est prudent ; le calcul essence + usure donne plutôt ~40 F/km).
