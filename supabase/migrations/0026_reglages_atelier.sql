-- Réglages généraux, un par compte (même schéma singleton que profil_entreprise).
-- Premier réglage : synchro produits <-> matières premières. Certains profils (illustratrices,
-- créatrices sans gestion de stock formelle) ne renseignent pas les matières premières et ne
-- veulent ni suggestion d'alerte stock, ni rappel de commande fournisseur. Activé par défaut
-- (comportement actuel inchangé pour les comptes existants) ; à désactiver depuis Compte.

create table public.reglages (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  sync_produits_matieres boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reglages enable row level security;
create policy "reglages: own row" on public.reglages
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger reglages_updated_at before update on public.reglages
  for each row execute function public.set_updated_at();
