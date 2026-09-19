-- Réglages du produit (pas d'un compte) : ce qui doit pouvoir changer sans redéployer.
--
-- Premiers occupants :
--   admin_email — l'adresse qui reçoit les demandes d'accès venues du site ;
--   app_url     — la base des liens d'invitation (le lien d'inscription doit viser l'app).
--
-- Pourquoi une table et pas un secret : ni une adresse de notification ni une URL publique ne
-- sont des secrets, et une ligne de SQL se change en dix secondes, sans redéploiement. Les
-- secrets `ADMIN_EMAIL` / `APP_URL` restent lus en priorité s'ils existent un jour.
--
-- La valeur posée ici est l'adresse **publique** de contact. Celle du déploiement réel est
-- réglée dans la base, pas dans ce fichier : le dépôt est public, une adresse personnelle n'y a
-- rien à faire.

create table public.reglages_produit (
  cle text primary key check (cle = lower(cle) and char_length(cle) between 2 and 40),
  valeur text not null check (char_length(valeur) between 1 and 300),
  maj_at timestamptz not null default now()
);

alter table public.reglages_produit enable row level security;
-- Aucune policy, volontairement : service_role uniquement.

insert into public.reglages_produit (cle, valeur) values
  ('admin_email', 'contact@braaise.io'),
  ('app_url', 'https://braise-ai.vercel.app')
on conflict (cle) do nothing;
