# Au Coin du Feu

Assistant virtuel pour la gestion d'une activité artisanale de bougies.
Mobile-first, PWA installable sur iPhone. Voir `specs/` pour la vision et la roadmap.

## V1 (en cours)

Planning réseaux sociaux : CRUD idées / publications, statuts
(idée → à faire → planifié → publié), rappels affichés à la connexion.

## Stack

- React + Vite + TypeScript, PWA via `vite-plugin-pwa`
- Supabase (Postgres + Auth), une table `content_entries`, RLS par `auth.uid()`
- React Query pour l'accès aux données
- Déploiement : Vercel

## Développement

```bash
npm install
cp .env.example .env   # renseigner URL + clé publishable Supabase
npm run dev
```

## Base de données

Migration dans `supabase/migrations/`. Déjà appliquée sur le projet Supabase
`au-coin-du-feu` (ref `nnssqleqvfafbkkxyqne`).

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

## Hors périmètre V1

Notifications push / service worker custom (V1.5), CRM boutiques (V2),
catalogue / matières / commandes (V3+), couche IA (V7).
