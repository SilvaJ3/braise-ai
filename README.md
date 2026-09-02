# Au Coin du Feu

Assistant virtuel pour la gestion d'une activité artisanale de bougies.
Mobile-first, PWA installable sur iPhone. Voir `specs/` pour la vision et la roadmap.

## Fonctionnel

- **Planning réseaux sociaux** (V1) : idées / publications, statuts, calendrier, rappels push (V1.5).
- **Boutiques** (V2) : fiches dépôt-vente, mini-carte, relances suggérées.
- **Atelier** (V3, en cours) : matières premières (stock, seuil, fournisseur), fournisseurs,
  **import par IA** d'un Excel / CSV / PDF / photo vers bougies, matières, fournisseurs ou boutiques.
- **Assistant** (V7) : chat d'idées, bilan hebdo, alertes stock et relances.

Détail et reste à faire : `ROADMAP.md`.

## Stack

- React + Vite + TypeScript, PWA via `vite-plugin-pwa`
- Supabase (Postgres + Auth + edge functions + pg_cron), RLS `user_id = (select auth.uid())` sur toutes les tables
- React Query pour l'accès aux données
- Edge functions (Deno) : `assistant` (chat + bilan hebdo), `push` (Web Push), `import` (parsing IA)
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
```

Secrets attendus : `ANTHROPIC_API_KEY`, `VAPID_PRIVATE_KEY` (+ `SUPABASE_*` fournis
automatiquement). Le secret de cron `assistant_cron_secret` vit dans Vault (voir migration 0003).
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
