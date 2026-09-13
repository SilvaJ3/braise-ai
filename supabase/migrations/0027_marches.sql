-- Marchés artisanaux : liste des marchés (nom, lieu, date), et pour chaque marché des lignes
-- de vente par produit qu'on incrémente au fil de la journée (pas de nouvelle ligne à chaque
-- vente : on appuie sur "+" sur la ligne du produit déjà présent). Le tout permet, une fois le
-- marché clôturé, d'agréger les ventes par produit/lieu pour voir ce qui marche où.

create table public.marches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nom text not null check (char_length(nom) between 1 and 200),
  lieu text not null check (char_length(lieu) between 1 and 200),
  date_marche date not null default current_date,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'cloture')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marches enable row level security;
create policy "marches: own rows" on public.marches
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index marches_user_date_idx on public.marches (user_id, date_marche desc);
create index marches_lieu_idx on public.marches (user_id, lieu);

create trigger marches_updated_at before update on public.marches
  for each row execute function public.set_updated_at();

-- Lignes de vente : une par produit et par marché (compteur incrémenté), ou en saisie libre
-- pour un article hors catalogue. `designation` et `prix_unitaire` sont figés au moment du
-- premier ajout, comme sur les bons de dépôt.
create table public.marche_lignes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  marche_id uuid not null references public.marches(id) on delete cascade,
  produit_id uuid references public.produits(id) on delete set null,
  designation text not null check (char_length(designation) between 1 and 300),
  quantite numeric(10,2) not null default 0 check (quantite >= 0),
  prix_unitaire numeric(10,2) not null default 0 check (prix_unitaire >= 0),
  note text check (note is null or char_length(note) <= 500),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marche_lignes enable row level security;
create policy "marche_lignes: own rows" on public.marche_lignes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Un seul produit du catalogue par marché : on incrémente la ligne existante plutôt que d'en
-- recréer une. Les articles en saisie libre (produit_id null) peuvent se répéter.
create unique index marche_lignes_marche_produit_idx
  on public.marche_lignes (marche_id, produit_id) where produit_id is not null;
create index marche_lignes_marche_idx on public.marche_lignes (marche_id, position);
create index marche_lignes_user_idx on public.marche_lignes (user_id);
create index marche_lignes_produit_idx on public.marche_lignes (produit_id);

create trigger marche_lignes_updated_at before update on public.marche_lignes
  for each row execute function public.set_updated_at();
