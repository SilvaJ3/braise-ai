-- V3 (fin) : commandes fournisseur, calquées sur `commandes`/`commande_lignes` (même geste de
-- saisie : entête + lignes, statuts qui avancent). Se crée depuis Atelier → À commander,
-- pré-remplie avec le besoin calculé pour un fournisseur. À la réception, le stock des
-- matières est incrémenté automatiquement (trigger), pas de double comptage possible : la
-- transition ne se déclenche qu'au passage effectif à 'recue'.

create table public.commandes_fournisseur (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  fournisseur_id uuid not null references public.fournisseurs(id),
  statut text not null default 'a_commander' check (statut in ('a_commander', 'commandee', 'recue')),
  date_commande date,
  date_reception date,
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commandes_fournisseur enable row level security;
create policy "commandes_fournisseur: own rows" on public.commandes_fournisseur
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index commandes_fournisseur_user_statut_idx on public.commandes_fournisseur (user_id, statut);
create index commandes_fournisseur_fournisseur_idx on public.commandes_fournisseur (fournisseur_id);

create trigger commandes_fournisseur_updated_at before update on public.commandes_fournisseur
  for each row execute function public.set_updated_at();

create table public.commande_fournisseur_lignes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  commande_fournisseur_id uuid not null references public.commandes_fournisseur(id) on delete cascade,
  matiere_id uuid not null references public.matieres_premieres(id),
  quantite numeric(12, 3) not null check (quantite > 0),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.commande_fournisseur_lignes enable row level security;
create policy "commande_fournisseur_lignes: own rows" on public.commande_fournisseur_lignes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index commande_fournisseur_lignes_commande_idx on public.commande_fournisseur_lignes (commande_fournisseur_id, position);
create index commande_fournisseur_lignes_user_idx on public.commande_fournisseur_lignes (user_id);
create index commande_fournisseur_lignes_matiere_idx on public.commande_fournisseur_lignes (matiere_id);

-- Réception : incrémente stock_actuel des matières des lignes, une seule fois par commande
-- (déclenché seulement au passage effectif à 'recue', jamais rejoué si le statut est retouché
-- sans changer, ni si on repasse à 'recue' depuis 'recue').
create or replace function public.commande_fournisseur_receptionner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.statut = 'recue' and old.statut is distinct from 'recue' then
    update public.matieres_premieres mp
    set stock_actuel = mp.stock_actuel + l.quantite
    from (
      select matiere_id, sum(quantite) as quantite
      from public.commande_fournisseur_lignes
      where commande_fournisseur_id = new.id
      group by matiere_id
    ) l
    where mp.id = l.matiere_id;
  end if;
  return new;
end;
$$;

create trigger commandes_fournisseur_receptionner
  after update on public.commandes_fournisseur
  for each row execute function public.commande_fournisseur_receptionner();
