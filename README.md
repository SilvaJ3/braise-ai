# Au Coin du Feu

Assistant virtuel pour la gestion d'une activité artisanale de bougies.
Mobile-first, PWA installable sur iPhone. Voir `specs/` pour la vision et la roadmap.

## Fonctionnel

- **Planning réseaux sociaux** (V1) : idées / publications, statuts, calendrier, rappels push (V1.5).
- **Boutiques** (V2) : fiches dépôt-vente, mini-carte, relances suggérées.
- **Atelier** (V3, en cours) : matières premières (stock, seuil, fournisseur), fournisseurs,
  **import par IA** d'un Excel / CSV / PDF / photo vers bougies, matières, fournisseurs ou boutiques.
- **Bons de dépôt** (V4) : bon signé au doigt sur le téléphone, PDF généré et envoyé par mail
  à la boutique (copie à l'artisane), archivé dans Supabase Storage.
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
```

Secrets attendus : `ANTHROPIC_API_KEY`, `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`,
`MAIL_DOMAIN` (+ `SUPABASE_*` fournis automatiquement). Le secret de cron `assistant_cron_secret` vit dans Vault (voir migration 0003).
### Envoi des mails (bons de dépôt)

Les mails partent du **service de l'application**, pas de la boîte de l'utilisateur : aucun
réglage technique ne lui est demandé, et un nouveau compte peut envoyer immédiatement.

- Expéditeur : `<nom commercial> <no-reply@braaise.io>` — une seule adresse fixe pour tous
  les comptes (« Au Coin du Feu » n'apparaît que dans le nom affiché).
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

App mono-utilisateur, pas d'écran d'inscription. Le compte d'Alexandra
(`alexandra.mnier@gmail.com`) est déjà créé avec un mot de passe temporaire —
à changer via l'écran **Compte** dans l'app après la première connexion.

À faire côté Supabase Studio : désactiver les inscriptions publiques
(Authentication → Sign In / Providers → "Allow new users to sign up" = off).
Ajouter un autre utilisateur : Authentication → Users → Add user.

## Déploiement

1. Pousser le repo sur GitHub
2. Importer dans Vercel, framework « Vite »
3. Variables d'environnement Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Sur iPhone (Safari) : ouvrir l'URL → Partager → « Sur l'écran d'accueil »
