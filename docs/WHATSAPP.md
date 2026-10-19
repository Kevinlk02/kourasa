# WhatsApp + SMS (Twilio) — ce qu'il faut créer

Deux messages partent vers les téléphones, toujours **WhatsApp d'abord, SMS en secours** :

| Message | Qui l'envoie | Configuration |
|---|---|---|
| Code de **connexion** (6 chiffres) | Supabase Auth | Tableau de bord Supabase → Authentication → Providers → **Phone** |
| Code de **livraison** (4 chiffres) + lien de suivi, au destinataire | Edge Function `create-delivery` | Secrets des Edge Functions |

Le code est déjà prêt dans les apps et sur le serveur : il suffit de créer les comptes et de renseigner les valeurs.
**Ne jamais envoyer ces identifiants dans une conversation** : les saisir directement dans Supabase.

## 1. Twilio
1. Créer un compte sur twilio.com et **passer en compte payant** (le compte d'essai n'envoie qu'aux numéros vérifiés et ne permet pas d'expéditeur WhatsApp).
2. Noter **Account SID** et **Auth Token** (Console → Account Info).
3. **SMS** : créer un **Messaging Service** (Messaging → Services) et y ajouter un expéditeur. Vérifier dans les règles SMS de Twilio pour le **Togo (+228)** et le **Tchad (+235)** si un expéditeur alphanumérique « Koursa » doit être pré-enregistré. → noter le SID `MG…`.
4. **Connexion (OTP)** : créer un service **Twilio Verify** (Verify → Services), activer les canaux **SMS** et **WhatsApp**. → noter le SID `VA…`. Verify gère lui-même les modèles WhatsApp de code de connexion.

## 2. Meta (WhatsApp Business)
1. Créer un **compte Meta Business** (business.facebook.com) et lancer la **vérification de l'entreprise** (documents de la société) : nécessaire pour lever les limites d'envoi.
2. Prendre un **numéro dédié à Koursa** (puce neuve) : il ne doit pas être utilisé dans l'app WhatsApp normale ni WhatsApp Business de téléphone.
3. Dans Twilio : Messaging → Senders → **WhatsApp senders** → « Self sign-up » : se connecter avec le compte Meta Business, enregistrer le numéro, nom d'affichage **Koursa**.
4. Créer le **modèle** du code de livraison (Twilio → Messaging → Content Template Builder), catégorie **Utility**, langue **français** :
   > Koursa : un colis arrive pour vous. Code de réception : {{1}} (à donner au coursier, uniquement quand vous avez le colis). Suivi : {{2}}

   Le soumettre à WhatsApp. Une fois approuvé (quelques minutes à 48 h) → noter le SID `HX…`.

## 3. Brancher dans Supabase (projet koursa)
**Connexion (OTP)** — Authentication → Providers → **Phone** : activer, fournisseur **Twilio Verify**, renseigner Account SID, Auth Token, Verify Service SID. Pour tester sans envoi : ajouter des numéros de test (`22890000001=123456`).

**Code de livraison** — Edge Functions → **Secrets** (ou `supabase secrets set` dans un terminal) :
```
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC…
TWILIO_AUTH_TOKEN=…
TWILIO_SMS_FROM=MG…
TWILIO_WHATSAPP_FROM=+228…
TWILIO_WHATSAPP_CONTENT_SID=HX…
SITE_URL=https://votre-domaine
```
Tant que `TWILIO_WHATSAPP_*` est vide, le code de livraison part par SMS uniquement. Tant que `SMS_PROVIDER=log`, rien n'est envoyé (le message apparaît dans les logs de la fonction).

## 4. Vérifier
- Connexion dans l'app : le code arrive sur WhatsApp ; bouton « Recevoir le code par SMS » en secours.
- Créer une course : la table `outbox_sms` indique pour chaque message le canal (`whatsapp` / `sms`) et l'erreur éventuelle.
