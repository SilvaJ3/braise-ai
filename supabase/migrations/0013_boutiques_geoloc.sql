-- Coordonnées GPS pour la mini-carte de la fiche boutique (géocodage manuel côté client).

alter table public.boutiques
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6);
