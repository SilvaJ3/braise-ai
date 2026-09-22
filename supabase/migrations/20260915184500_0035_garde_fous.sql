-- 0035 — Garde-fous mineurs et index manquants.
--
-- Aucun de ces points ne casse l'usage actuel, mais chacun accepte aujourd'hui un état que
-- l'application ne produit jamais : la base ne devrait pas être plus permissive que le code.

-- 1. Coordonnées bornées --------------------------------------------------------------------
-- numeric(9,6) acceptait lat 999.999999 : la mini-carte affichait un point aberrant, sans
-- erreur ni à la saisie ni au géocodage.

alter table public.boutiques
  add constraint boutiques_lat_range check (lat is null or lat between -90 and 90),
  add constraint boutiques_lng_range check (lng is null or lng between -180 and 180);

-- 2. Une commande boutique ne porte pas de contact personnel ---------------------------------
-- `commandes_cible` interdisait client_nom pour type = 'boutique', mais rien n'interdisait
-- client_email et client_telephone ajoutés ensuite : la cible de la commande devenait ambiguë.

alter table public.commandes drop constraint if exists commandes_cible;
alter table public.commandes add constraint commandes_cible check (
  (type = 'boutique' and boutique_id is not null and client_nom is null
    and client_email is null and client_telephone is null)
  or (type = 'personne' and boutique_id is null and client_nom is not null)
);

-- 3. Un marché clôturé ne se modifie plus ----------------------------------------------------
-- Ses lignes restaient modifiables après clôture, ce qui faussait après coup les agrégats de
-- ventes — l'intérêt même de la table.

create or replace function public.marche_lignes_verrou() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_marche uuid;
  v_statut text;
begin
  v_marche := case when tg_op = 'DELETE' then old.marche_id else new.marche_id end;

  select statut into v_statut from public.marches where id = v_marche;
  if v_statut = 'cloture' then
    raise exception 'Marché clôturé : ses lignes ne sont plus modifiables'
      using errcode = 'restrict_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists marche_lignes_verrou on public.marche_lignes;
create trigger marche_lignes_verrou
  before insert or update or delete on public.marche_lignes
  for each row execute function public.marche_lignes_verrou();

-- 4. Index de tri ---------------------------------------------------------------------------
-- Les écrans listent ces tables avec `.order('nom')`, mais seul l'index (user_id, lower(nom))
-- existait — celui du dédoublonnage d'import, incapable de servir un ORDER BY nom.

create index if not exists produits_user_nom_col_idx on public.produits (user_id, nom);
create index if not exists boutiques_user_nom_col_idx on public.boutiques (user_id, nom);
create index if not exists fournisseurs_user_nom_col_idx on public.fournisseurs (user_id, nom);
create index if not exists matieres_premieres_user_nom_col_idx on public.matieres_premieres (user_id, nom);

-- 5. Journal d'usage : une rétention ---------------------------------------------------------
-- `app_events` ne reçoit que des insertions et croissait indéfiniment.

create or replace function public.purger_app_events() returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.app_events where created_at < now() - interval '12 months';
$$;

revoke all on function public.purger_app_events() from public, anon, authenticated;
