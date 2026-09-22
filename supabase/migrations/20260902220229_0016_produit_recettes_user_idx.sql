-- Index FK manquant signalé par l'advisor après 0015.
create index if not exists produit_recettes_user_idx on public.produit_recettes (user_id, produit_id);
