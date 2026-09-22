-- Encodeur de commande : soit pour une boutique (dépôt-vente à préparer), soit pour une
-- personne (commande client encodée par nom). Une table commune avec un type, comme les
-- bons de dépôt : lignes ajoutées une par une, même geste de saisie.

create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('boutique','personne')),
  boutique_id uuid references public.boutiques(id) on delete set null,
  client_nom text check (client_nom is null or char_length(client_nom) <= 200),
  date_echeance date not null,
  statut text not null default 'demande' check (statut in ('demande','confirmee','en_prod','livree')),
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une commande boutique porte une boutique, une commande personne porte un nom de client.
  constraint commandes_cible check (
    (type = 'boutique' and boutique_id is not null and client_nom is null) or
    (type = 'personne' and boutique_id is null and client_nom is not null)
  )
);

alter table public.commandes enable row level security;
create policy "commandes: own rows" on public.commandes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index commandes_user_echeance_idx on public.commandes (user_id, date_echeance);
create index commandes_boutique_idx on public.commandes (boutique_id, date_echeance);

create trigger commandes_updated_at before update on public.commandes
  for each row execute function public.set_updated_at();

-- Lignes : bougie, couleur (texte libre), quantité. `designation` figée à l'ajout (le
-- catalogue peut bouger), `produit_id` ne sert qu'à retrouver l'origine — même logique que
-- `depot_lignes`.
create table public.commande_lignes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  produit_id uuid references public.produits(id) on delete set null,
  designation text not null check (char_length(designation) between 1 and 300),
  couleur text check (couleur is null or char_length(couleur) <= 100),
  quantite numeric(10,2) not null check (quantite > 0),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.commande_lignes enable row level security;
create policy "commande_lignes: own rows" on public.commande_lignes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index commande_lignes_commande_idx on public.commande_lignes (commande_id, position);
create index commande_lignes_user_idx on public.commande_lignes (user_id);
create index commande_lignes_produit_idx on public.commande_lignes (produit_id);
