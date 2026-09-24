# Braaise

Assistant virtuel pour la gestion d'une activité artisanale de bougies.
Mobile-first, PWA installable sur iPhone. Voir `specs/` pour la vision et la roadmap.

## Fonctionnel

- **Planning réseaux sociaux** (V1) : idées / publications, statuts, calendrier, rappels push (V1.5).
- **Carte « Pour démarrer »** (T6) : sur l'accueil, les trois choses qui manquent au compte pour que
  l'app serve à quelque chose (une boutique, des produits, le premier bon signé), lues dans les
  données — chaque ligne disparaît quand c'est fait, la carte se masque définitivement.
- **Inscription sur invitation** : compte créé côté serveur après vérification d'un code ; le
  tunnel d'accueil (activité, lieu, catalogue de départ) est la prochaine tranche.
- **Boutiques** (V2) : fiches dépôt-vente, mini-carte, relances suggérées.
- **Atelier** (V3, en cours) : matières premières (stock, seuil, fournisseur), fournisseurs,
  **import par IA** d'un Excel / CSV / PDF / photo vers bougies, matières, fournisseurs ou boutiques.
- **Bons de dépôt** (V4) : bon signé au doigt sur le téléphone, PDF généré et envoyé par mail
  à la boutique (copie à l'artisan), archivé dans Supabase Storage.
- **Assistant** (V7) : chat d'idées, bilan hebdo, alertes stock et relances.

Détail et reste à faire : `ROADMAP.md`.

## Stack

- React + Vite + TypeScript, PWA via `vite-plugin-pwa`
- Supabase (Postgres + Auth + edge functions + pg_cron), RLS `user_id = (select auth.uid())` sur toutes les tables
- React Query pour l'accès aux données
- Edge functions (Deno) : `assistant` (chat + bilan hebdo), `push` (Web Push), `import` (parsing IA),
  `depot` (PDF du bon de dépôt + envoi du mail)
- Déploiement : Vercel

## Développement

```bash
npm install
cp .env.example .env   # renseigner URL + clé publishable Supabase
npm run dev
npm run check   # lint + typecheck + tests (ce que fait la CI)
```

## Base de données

Migrations dans `supabase/migrations/`, appliquées sur le projet Supabase
`au-coin-du-feu` (ref `nnssqleqvfafbkkxyqne`). Règle : toute table = `user_id not null`
+ RLS `(select auth.uid())` dès la migration.

## Edge functions

```bash
supabase functions deploy assistant
supabase functions deploy push
supabase functions deploy import
supabase functions deploy depot
supabase functions deploy inscription
```

Secrets attendus : `ANTHROPIC_API_KEY`, `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`,
`MAIL_DOMAIN` (+ `SUPABASE_*` fournis automatiquement). Le secret de cron `assistant_cron_secret` vit dans Vault (voir migration 0003).

**Un push sur `main` redéploie les fonctions** (intégration GitHub côté Supabase, confirmée le
16/09) : ce qui part sur `main` part en production sans autre geste — fonction, et donc
comportement. Un déploiement manuel par l'API reste possible et sert à choisir exactement les
fichiers joints (`_shared/` inclus), mais il n'est pas le seul chemin. Vérifier après coup le corps
servi (`GET /v1/projects/{ref}/functions/{slug}/body`).

**Après tout déploiement de `assistant`, vérifier un vrai tour de chat** — le service peut
démarrer, répondre `401` sur un appel anonyme, et n'être cassé que sur le chemin authentifié :

```bash
# avec un compte de test : obtenir une session, poser une question, relire la réponse
curl -s "$SUPABASE_URL/functions/v1/assistant" \
  -H "Authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"mode":"chat","message":"En une phrase, qu'"'"'est-ce que je fabrique ?"}'
# -> {"pending_id": "…"} puis la réponse dans public.chat_messages (status = done)
```

Le 16/09/2026, ce contrôle a montré que le chat répondait `400 message vide` à **toutes** les
questions : le corps de la requête était lu deux fois (`Deno.serve` pour connaître `mode`, puis
`handleChat`), et un `Request` ne se relit pas.

### Envoi des mails (bons de dépôt)

Les mails partent du **service de l'application**, pas de la boîte de l'utilisateur : aucun
réglage technique ne lui est demandé, et un nouveau compte peut envoyer immédiatement.

- Expéditeur : `<nom commercial> <no-reply@braaise.io>` — une seule adresse fixe pour tous
  les comptes (« Braaise » n'apparaît que dans le nom affiché).
- `Reply-To` pointe sur l'adresse saisie dans **Compte → Mes coordonnées** : quand une
  boutique répond, le message arrive directement chez l'utilisateur.

Mise en place, une seule fois :

1. Créer un compte sur [resend.com](https://resend.com) (gratuit : 3000 mails/mois,
   100/jour) et générer une clé API (`re_…`).
2. **Pour tester sans rien acheter** : poser `RESEND_API_KEY` et `MAIL_DOMAIN=resend.dev`
   dans les secrets Supabase (Dashboard → Edge Functions → Secrets). Les bons partent alors
   de `onboarding@resend.dev` et **ne peuvent être envoyés qu'à l'adresse du compte Resend** :
   de quoi valider toute la chaîne (PDF, pièce jointe, mise en forme) avant d'aller plus loin.
3. **Pour de vrai** : acheter le domaine, l'ajouter dans Resend → *Domains*, poser les 3
   enregistrements DNS proposés (SPF, DKIM, suivi), attendre la vérification, puis passer
   `MAIL_DOMAIN=braaise.io`.

Tant que le domaine n'est pas vérifié, l'envoi échoue avec le message renvoyé par Resend
(« domain is not verified »), affiché tel quel dans l'app. Changer de prestataire ne demande
que de réécrire `envoyerMail` dans `_shared/mailer.ts`.

**Variante possible plus tard** : faire suivre `alias@braaise.io` vers la boîte de
l'utilisateur (Cloudflare Email Routing, gratuit) pour que son adresse personnelle
n'apparaisse plus du tout dans les mails. Le `Reply-To` deviendrait alors inutile.

`supabase/functions/_shared/` est partagé entre les fonctions et importé par le front
(`src/lib/importer.ts`) : TypeScript pur, pas de dépendance Deno/DOM.

## Compte utilisateur

L'inscription publique est **désactivée** sur le projet Supabase : le seul chemin vers un compte
est l'edge function `inscription`, qui exige un code d'invitation (table `invitations`, illisible
par le client). Le compte est créé côté serveur, déjà confirmé, et sa ligne `assistant_profil` est
ouverte avec `onboarding_completed_at` à null — c'est cette colonne qui déclenchera le tunnel
d'accueil.

Créer un code, depuis l'éditeur SQL de Supabase (ou `execute_sql`) :

```sql
-- note = pour qui, email = adresse imposée (optionnel), validité en jours
select public.invitation_creer('Abeille Blanche — dépôt-vente', 'contact@exemple.be', 'fondateur', 30);
-- -> '7K2M-9QX4-ABCD'
```

**Le chemin normal n'est plus le SQL.** Le site (`braaise.io`) porte un formulaire « demande ton
accès » qui appelle l'edge function `demande-acces` : la demande est rangée dans `demandes_acces`,
une notification part vers l'adresse d'administration (`reglages_produit.admin_email`) avec un
**jeton de validation à usage unique**, et l'invitation n'est créée qu'au clic sur ce lien — le
formulaire public ne peut pas fabriquer d'invitations. Le lien de validation n'agit pas tout seul
au chargement (un antivirus ou un aperçu de mail ouvre les liens) : il ouvre une page, le bouton
agit. Puis l'invitation part par mail avec le code **déjà dans le lien** : `/inscription?code=…`.

Suivi de l'entonnoir :

```sql
select email, atelier, statut, invitation_code, created_at from public.demandes_acces order by created_at desc;
```

L'utilisatrice va sur `/inscription`, saisit le code, son email et un mot de passe (10 caractères
minimum, avec minuscule, majuscule et chiffre — c'est la politique du service), et se retrouve
connectée.

Suivi des inscriptions et de l'entonnoir :

```sql
select code, note, used_at, used_by from public.invitations order by created_at desc;
select resultat, count(*) from public.inscription_tentatives group by resultat;
```

**Pas d'email de confirmation aujourd'hui** : GoTrue n'envoie rien sur ce projet (aucun SMTP), donc
le code fait office de vérification. Tant que ce n'est pas branché, une personne qui perd son mot
de passe ne peut pas le réinitialiser seule — la remise à zéro passe par le tableau de bord
Supabase (Authentication → Users) ou par un appel Admin API.

Ajouter un utilisateur à la main : Authentication → Users → Add user.

## Plans, quotas et encaissement

Chaque compte porte un plan (`assistant_profil.plan`) : `essai`, `fondateur`, `mensuel`, `annuel`.
**Les quotas par défaut vivent dans `supabase/functions/_shared/compte.ts`** — seule source de
vérité ; la contrainte en base ne fait que reprendre la liste des plans.

| Plan | Questions / mois | Imports / mois |
|---|---|---|
| essai | 40 | 3 |
| fondateur | 150 | 20 |
| mensuel | 150 | 20 |
| annuel | 150 | 20 |

- Le compteur est **mensuel, mois calendaire Europe/Bruxelles** (`quotas_mensuels`). Le compte ne
  peut que le lire ; `consommer_quota_mois()` l'incrémente de façon atomique, **avant** l'appel au
  modèle — réserver puis appeler, jamais l'inverse.
- Les jetons réellement consommés sont journalisés dans `usage_llm`, par fonction (`assistant`,
  `bilan`, `import`). L'écran Compte → Mon compte lit `mon_compte()`, qui agrège le mois sous la
  RLS du compte appelant : l'affichage ne peut pas mentir sur ce qui est compté.
- Déroger au quota d'un compte (dépannage, geste commercial) :
  `update public.assistant_profil set quota_mensuel = 500 where user_id = '…';`

### Encaisser — Stripe, à la main

Le paiement reste **hors de l'app** : un lien de paiement par formule, et l'activation se fait à
la main tant qu'il y a peu de comptes.

1. Ouvrir un compte Stripe — **il faut un numéro d'entreprise (BCE)** : c'est le prérequis, pas
   le prestataire.
2. Créer trois abonnements dans Produits : Fondateur 29 €/mois HTVA (prix bloqué 2 ans, 10 premiers comptes), Mensuel 39 €/mois HTVA, Annuel 390 €/an HTVA.
3. Pour chacun, un **lien de paiement** en mode abonnement, à envoyer dans la conversation.
4. Au paiement reçu, passer le compte au bon plan :
   `update public.assistant_profil set plan = 'fondateur', plan_depuis = now() where user_id = '…';`
5. Plus tard, si le volume le justifie : un webhook Stripe (`invoice.paid`) vers une petite edge
   function qui fait la même chose sans intervention.

Coûts relevés le 16/09/2026 (tarifs Stripe, EEE) : cartes standard **1,5 % + 0,25 €**, prélèvement
SEPA **0,35 € forfait**, Bancontact 1,40 % + 0,25 € (*à l'acte seulement*), plus **0,7 % de Stripe
Billing sur le volume récurrent**. Le SEPA est la voie la moins chère pour un abonnement — 0,35 €
par prélèvement, quel que soit le montant.

## Déploiement

1. Pousser le repo sur GitHub
2. Importer dans Vercel, framework « Vite »
3. Variables d'environnement Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Sur iPhone (Safari) : ouvrir l'URL → Partager → « Sur l'écran d'accueil »
