# Démarrage — ce qu'il faut préparer avant la phase 0

## 1. Sur ton ordinateur
- **Node.js 20 ou plus récent**, **pnpm**, **Git**
- **Claude Code** (installé et connecté)
- **Supabase CLI** et **Docker Desktop** (pour la base locale)
- **EAS CLI** (`npm install -g eas-cli`)
- Un **téléphone Android** pour tester (idéalement un Tecno, Infinix ou Itel, comme tes utilisateurs)

## 2. Comptes à créer
| Compte | Pour quoi | Coût |
|---|---|---|
| GitHub | Sauvegarder le code | Gratuit |
| Supabase | Base de données, connexion, temps réel, fichiers | Gratuit pour démarrer, payant en production |
| Google Cloud (Maps Platform) | Cartes, recherche d'adresses, itinéraires | Facturation obligatoire, payant à l'usage (crédit mensuel gratuit selon la grille en vigueur) |
| Firebase (même projet Google) | Notifications push (FCM) | Gratuit |
| Expo (EAS) | Construire les APK, mises à jour automatiques | Gratuit pour démarrer |
| Fournisseur SMS (compatible Supabase Auth) | Codes de connexion par SMS | Payant par SMS : vérifier la livraison vers +228 et +235 |
| Nom de domaine | Le site de téléchargement | Quelques milliers de F par an |
| Vercel (ou équivalent) | Héberger le site, la PWA, l'admin | Gratuit pour démarrer |
| Sentry | Voir les plantages | Gratuit pour démarrer |

**Pas besoin** de Google Play Console ni d'Apple Developer : on ne passe pas par les stores.

## 3. Google Cloud, pas à pas
1. Créer un projet « Koursa », activer la facturation.
2. Activer : Maps SDK for Android, Maps JavaScript API, Places API (New), Geocoding API, Routes API.
3. Créer **3 clés** (voir `GOOGLE_MAPS.md`) : Android, Web, Serveur. Restreindre chacune.
   La clé Android a besoin de l'empreinte SHA-1 du certificat EAS : Claude Code te la donnera après le premier build (`eas credentials`).
4. Créer une **alerte budget** (par exemple au montant que tu acceptes de dépenser par mois) et des **quotas journaliers**.

## 4. Ce que tu dois décider ou fournir
- Le **nom** de l'app et le domaine (Koursa est provisoire).
- Le **logo** et la couleur de marque.
- Les **limites des 2 zones de Lomé** : liste complète des quartiers de chaque zone, et la route qui sert de frontière. Tu pourras dessiner les zones toi-même dans l'admin (phase 8).
- Les réponses aux **points ouverts** en fin de `MVP.md`.

## 5. Lancer le projet
1. Dézippe le kit dans un dossier, par exemple `koursa/`.
2. Ouvre un terminal dans ce dossier : `git init`, puis `claude`.
3. Colle le prompt de la **phase 0** de `PROMPTS.md`.
4. Copie `.env.example` en `.env` et remplis les clés au fur et à mesure que Claude Code en a besoin. Ne partage jamais ce fichier.

## 6. Sauvegardes vitales
- Le **keystore Android** (géré par EAS) : télécharge-le et garde-le en 2 endroits sûrs. Sans lui, plus de mise à jour possible pour les gens qui ont déjà installé l'app.
- Les **clés API** et le mot de passe de la base de production.
