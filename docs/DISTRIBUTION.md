# Distribution sans Play Store ni App Store

Décision : les applications se téléchargent **depuis notre site**. Pas de Google Play, pas d'App Store.

## Ce que ça implique (à savoir avant de coder)
| | Android | iPhone |
|---|---|---|
| App client | **APK** téléchargé sur le site et installé directement | **PWA** : le client ouvre le site dans Safari puis « Partager → Sur l'écran d'accueil ». L'icône s'ouvre comme une app |
| App coursier | **APK** (lien donné aux coursiers validés) | **Impossible sans App Store** : Apple n'autorise pas l'installation d'apps natives hors App Store. Les coursiers doivent avoir un Android |
| Notifications | FCM, fonctionne hors Play Store (il faut les services Google sur le téléphone, présents sur Tecno/Infinix/Itel/Samsung) | Web Push, seulement si la PWA est ajoutée à l'écran d'accueil (iOS 16.4 ou plus récent) |
| Mises à jour | EAS Update (automatique) + nouvel APK si besoin | Automatique : c'est un site web |

## Android : APK
- `eas.json` contient un profil `apk` : `{"android": {"buildType": "apk"}, "distribution": "internal", "channel": "production"}`. Un profil par app (client, coursier).
- Deux identifiants de package distincts, par exemple `tg.koursa.client` et `tg.koursa.courier`. **Ne jamais les changer** après la première diffusion.
- **Clé de signature** : gérée par EAS. En télécharger une sauvegarde (`eas credentials`) et la garder en lieu sûr hors du projet. Si elle est perdue, plus aucune mise à jour ne pourra s'installer par-dessus l'app existante : chaque utilisateur devrait désinstaller et réinstaller.
- L'empreinte SHA-1 de ce certificat sert à restreindre la clé Google Maps Android.
- APK léger : pas de dépendance inutile, images optimisées, Hermes activé.
- Les APK sont hébergés dans un bucket public de Supabase Storage (`downloads/`), servis par une URL stable de notre domaine : `/telecharger/koursa.apk` (redirection vers la dernière version).

### Installer un APK hors Play Store (ce que l'utilisateur doit faire)
1. Ouvrir le site sur son téléphone, toucher « Télécharger pour Android ».
2. Autoriser son navigateur à installer des applications inconnues (Android le demande une fois).
3. Ouvrir le fichier téléchargé, toucher « Installer ». Play Protect peut afficher un avertissement « application inconnue » : toucher « Installer quand même ».
La page `/telecharger` explique ces étapes avec des captures d'écran (à faire sur un Tecno ou un Infinix, les plus courants).

## iPhone : PWA (app client seulement)
- La PWA est l'export web de `apps/client` (`expo export -p web`), servie par `apps/web` sous `/app`.
- `manifest.webmanifest` (nom, icônes 192/512, `display: standalone`, couleur de thème) + service worker (cache de l'interface pour démarrer vite en 3G).
- Sur iPhone, la page `/telecharger` affiche l'instruction « Partager → Sur l'écran d'accueil » avec un schéma.
- Limites PWA iOS : pas de suivi GPS en arrière-plan (sans importance pour le client), notifications seulement après ajout à l'écran d'accueil.
- Un client Android qui ne veut pas installer d'APK peut aussi utiliser la PWA.

## Le site de téléchargement (`apps/web`)
Pages :
- `/` : présentation courte (ce qu'on livre, zones desservies, prix d'exemple), bouton principal « Télécharger ».
- `/telecharger` : **détecte le téléphone** (Android / iPhone / ordinateur) et montre le bon bouton. Sur ordinateur : QR code à scanner. Affiche la version, la date, la taille du fichier et l'empreinte SHA-256 de l'APK.
- `/coursiers` : devenir coursier (conditions, documents à préparer) et lien de l'APK coursier.
- `/app` : la PWA client.
- `/t/[token]` : suivi pour le destinataire (sans installation).
- `/admin` : back-office (accès admin uniquement).
- Mentions légales et politique de confidentialité (obligatoires : on collecte téléphones et positions GPS).

Hébergement : Vercel (ou équivalent) avec un nom de domaine à nous, en HTTPS.

## Mises à jour
**1. Mises à jour JS (la plupart) : EAS Update.** Correctifs et nouvelles fonctions sans changement natif. L'app télécharge la mise à jour en arrière-plan et l'applique au redémarrage. Rien à faire pour l'utilisateur.

**2. Mises à jour natives : nouvel APK.** Nécessaires quand on change de version d'Expo SDK ou qu'on ajoute un module natif. Mécanisme :
- Table `app_versions` : `app` (client|courier), `platform` (android|web), `latest_version`, `min_version`, `apk_url`, `sha256`, `changelog`, `published_at`.
- Au démarrage, l'app compare sa version :
  - inférieure à `min_version` → écran bloquant « Mise à jour obligatoire » avec bouton de téléchargement ;
  - inférieure à `latest_version` → bandeau discret « Nouvelle version disponible ».
- Le bouton ouvre l'URL de l'APK dans le navigateur (simple et fiable). Le téléchargement et l'installation dans l'app elle-même ne sont **pas** au MVP.
- Publier une version = construire l'APK, l'envoyer dans Storage, ajouter une ligne dans `app_versions` depuis l'admin.

## Points de vigilance
- Permission de localisation en arrière-plan pour l'app coursier (« Toujours autoriser ») + service au premier plan avec notification permanente pendant une course.
- Sur Tecno / Infinix / Itel, l'économiseur de batterie tue les apps en arrière-plan : écran d'aide dans l'app coursier pour désactiver l'optimisation de batterie pour Koursa.
- Les utilisateurs ont peur des APK : domaine propre, HTTPS, nom et logo cohérents, empreinte affichée, et toujours la même clé de signature.
