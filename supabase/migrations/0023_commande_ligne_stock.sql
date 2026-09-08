-- Une ligne de commande peut être couverte par du stock déjà fait : elle sort alors du
-- calcul du besoin en matière première (voir la vue « À commander » de l'Atelier), sans
-- toucher à la commande elle-même ni à un vrai système d'inventaire.
alter table public.commande_lignes
  add column deja_en_stock boolean not null default false;
