-- 0033 — Les écritures critiques deviennent atomiques.
--
-- Trois écritures perdaient des données en silence :
-- 1. Les lignes d'un bon de dépôt et d'une commande étaient publiées en « delete puis insert »
--    sans transaction (src/lib/depots.ts, src/lib/commandes.ts). Si l'insert échouait (réseau
--    mobile, RLS, timeout), l'en-tête restait à jour et le document se retrouvait sans lignes.
-- 2. Les quantités d'un marché étaient écrites en valeur absolue calculée depuis le cache
--    (quantite + delta). Deux taps avant le refetch recalculent la même base : une vente
--    perdue. Or le +/− est le geste répété tout au long du marché.
--
-- Les fonctions ci-dessous font le travail côté base, en une transaction. Elles sont
-- SECURITY DEFINER (elles écrivent dans une table dont la RLS exige auth.uid()) donc chacune
-- vérifie explicitement la propriété avant d'agir.

-- 1. Lignes d'un bon de dépôt ---------------------------------------------------------------

create or replace function public.enregistrer_depot_lignes(p_depot uuid, p_lignes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_nb int;
begin
  select user_id into v_user
  from public.depots
  where id = p_depot and user_id = auth.uid();

  if v_user is null then
    raise exception 'bon de dépôt inconnu' using errcode = 'insufficient_privilege';
  end if;

  -- Le delete et l'insert sont dans la même transaction : soit les deux passent, soit aucun.
  delete from public.depot_lignes where depot_id = p_depot;

  insert into public.depot_lignes
    (user_id, depot_id, produit_id, designation, quantite, prix_unitaire, position)
  select
    v_user,
    p_depot,
    nullif(l->>'produit_id', '')::uuid,
    coalesce(nullif(l->>'designation', ''), 'Article'),
    coalesce((l->>'quantite')::numeric, 0),
    coalesce((l->>'prix_unitaire')::numeric, 0),
    coalesce((l->>'position')::smallint, 0)
  from jsonb_array_elements(p_lignes) as l;

  get diagnostics v_nb = row_count;
  return v_nb;
end $$;

revoke all on function public.enregistrer_depot_lignes(uuid, jsonb) from public, anon;
grant execute on function public.enregistrer_depot_lignes(uuid, jsonb) to authenticated;

-- 2. Lignes d'une commande boutique ---------------------------------------------------------

create or replace function public.enregistrer_commande_lignes(p_commande uuid, p_lignes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_nb int;
begin
  select user_id into v_user
  from public.commandes
  where id = p_commande and user_id = auth.uid();

  if v_user is null then
    raise exception 'commande inconnue' using errcode = 'insufficient_privilege';
  end if;

  delete from public.commande_lignes where commande_id = p_commande;

  insert into public.commande_lignes
    (user_id, commande_id, produit_id, designation, couleur, quantite, deja_en_stock, position)
  select
    v_user,
    p_commande,
    nullif(l->>'produit_id', '')::uuid,
    coalesce(nullif(l->>'designation', ''), 'Article'),
    nullif(l->>'couleur', ''),
    coalesce((l->>'quantite')::numeric, 0),
    coalesce((l->>'deja_en_stock')::boolean, false),
    coalesce((l->>'position')::smallint, 0)
  from jsonb_array_elements(p_lignes) as l;

  get diagnostics v_nb = row_count;
  return v_nb;
end $$;

revoke all on function public.enregistrer_commande_lignes(uuid, jsonb) from public, anon;
grant execute on function public.enregistrer_commande_lignes(uuid, jsonb) to authenticated;

-- 3. Quantités d'un marché : incrément en base, jamais en valeur absolue ---------------------

create or replace function public.ajuster_quantite_marche(p_ligne uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantite numeric;
begin
  update public.marche_lignes
  set quantite = greatest(quantite + p_delta, 0),
      updated_at = now()
  where id = p_ligne and user_id = auth.uid()
  returning quantite into v_quantite;

  if v_quantite is null then
    raise exception 'ligne de marché inconnue' using errcode = 'insufficient_privilege';
  end if;

  return v_quantite;
end $$;

revoke all on function public.ajuster_quantite_marche(uuid, numeric) from public, anon;
grant execute on function public.ajuster_quantite_marche(uuid, numeric) to authenticated;

-- Enregistre une vente : incrémente la ligne du produit si elle existe, la crée sinon.
-- Tout se passe dans un seul aller-retour, donc le « +1 » ne peut plus être perdu.
create or replace function public.vendre_produit_marche(
  p_marche uuid,
  p_produit uuid,
  p_designation text,
  p_prix numeric default 0
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_quantite numeric;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'authentification requise' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.marches where id = p_marche and user_id = v_user) then
    raise exception 'marché inconnu' using errcode = 'insufficient_privilege';
  end if;

  update public.marche_lignes
  set quantite = quantite + 1, updated_at = now()
  where marche_id = p_marche
    and user_id = v_user
    and produit_id is not distinct from p_produit
  returning quantite into v_quantite;

  if v_quantite is null then
    insert into public.marche_lignes
      (user_id, marche_id, produit_id, designation, quantite, prix_unitaire)
    values (v_user, p_marche, p_produit, coalesce(nullif(p_designation, ''), 'Article'), 1, p_prix)
    returning quantite into v_quantite;
  end if;

  return v_quantite;
end $$;

revoke all on function public.vendre_produit_marche(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.vendre_produit_marche(uuid, uuid, text, numeric) to authenticated;
