-- 0042 — La carte « Pour démarrer » se masque une fois pour toutes, par compte.
--
-- Le tunnel d'accueil (0036) remplit le profil ; il ne dit pas quoi faire ensuite. La checklist de
-- démarrage, elle, est pilotée par les données : une étape se termine quand la donnée existe
-- vraiment (une boutique, un produit, un bon signé), donc elle ne ment jamais et ne se rejoue pas
-- après une réinstallation. La seule chose qu'on ne peut pas déduire des données, c'est le refus
-- de la voir : quelqu'un qui a tout rempli et masque la carte ne doit pas la retrouver en
-- changeant de téléphone. D'où une colonne côté serveur plutôt qu'un drapeau local.

alter table public.assistant_profil
  add column if not exists demarrage_ferme_at timestamptz;
