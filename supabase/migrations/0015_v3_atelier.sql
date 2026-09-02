-- V3 (début) : fournisseurs, matières premières, recettes (BOM) + alerte stock assistant.
-- Règle multi-tenant : user_id not null + RLS (select auth.uid()) dès la création.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Fournisseurs ------------------------------------------------------------------------------

create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nom text not null check (char_length(nom) between 1 and 200),
  email text check (email is null or char_length(email) <= 200),
  telephone text check (telephone is null or char_length(telephone) <= 50),
  site_web text check (site_web is null or char_length(site_web) <= 300),
  delai_livraison_jours smallint
    check (delai_livraison_jours is null or delai_livraison_jours between 0 and 365),
  notes text check (notes is null or char_length(notes) <= 4000),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fournisseurs enable row level security;
create policy "fournisseurs: own rows" on public.fournisseurs
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Clé de dédoublonnage import : nom, insensible à la casse, par utilisateur.
create unique index fournisseurs_user_nom_idx on public.fournisseurs (user_id, lower(nom));

create trigger fournisseurs_updated_at before update on public.fournisseurs
  for each row execute function public.set_updated_at();

-- Matières premières ------------------------------------------------------------------------

create table public.matieres_premieres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nom text not null check (char_length(nom) between 1 and 200),
  categorie text check (categorie is null or categorie in ('cire','meche','parfum','contenant','colorant','emballage','autre')),
  unite text not null default 'g' check (unite in ('g','kg','ml','l','piece','m')),
  stock_actuel numeric(12,3) not null default 0 check (stock_actuel >= 0),
  seuil_alerte numeric(12,3) check (seuil_alerte is null or seuil_alerte >= 0),
  prix_unitaire numeric(10,4) check (prix_unitaire is null or prix_unitaire >= 0),
  fournisseur_id uuid references public.fournisseurs(id) on delete set null,
  reference_fournisseur text check (reference_fournisseur is null or char_length(reference_fournisseur) <= 100),
  notes text check (notes is null or char_length(notes) <= 4000),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.matieres_premieres enable row level security;
create policy "matieres_premieres: own rows" on public.matieres_premieres
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create unique index matieres_premieres_user_nom_idx on public.matieres_premieres (user_id, lower(nom));
create index matieres_premieres_fournisseur_idx on public.matieres_premieres (fournisseur_id);

create trigger matieres_premieres_updated_at before update on public.matieres_premieres
  for each row execute function public.set_updated_at();

-- Recettes (BOM) : quantité de matière par unité de produit ---------------------------------

create table public.produit_recettes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  matiere_id uuid not null references public.matieres_premieres(id) on delete cascade,
  quantite numeric(12,3) not null check (quantite > 0),
  created_at timestamptz not null default now(),
  unique (produit_id, matiere_id)
);

alter table public.produit_recettes enable row level security;
create policy "produit_recettes: own rows" on public.produit_recettes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index produit_recettes_matiere_idx on public.produit_recettes (matiere_id);

-- Produits : updated_at + clé de dédoublonnage import par nom ------------------------------

alter table public.produits add column if not exists updated_at timestamptz not null default now();
create trigger produits_updated_at before update on public.produits
  for each row execute function public.set_updated_at();

-- Pas d'index unique sur produits.nom : des doublons peuvent déjà exister. L'import
-- dédoublonne côté app (shopify_handle, puis nom insensible à la casse).
create index if not exists produits_user_lower_nom_idx on public.produits (user_id, lower(nom));

-- Boutiques : idem, dédoublonnage import par nom.
create index if not exists boutiques_user_lower_nom_idx on public.boutiques (user_id, lower(nom));

-- Assistant : suggestion alerte_stock -------------------------------------------------------

alter table public.assistant_suggestions
  add column matiere_id uuid references public.matieres_premieres(id) on delete cascade;

alter table public.assistant_suggestions
  drop constraint assistant_suggestions_type_check;

alter table public.assistant_suggestions
  add constraint assistant_suggestions_type_check
  check (type in ('idee_contenu','observation','relance_boutique','alerte_stock'));

create index assistant_suggestions_matiere_idx on public.assistant_suggestions (matiere_id);
