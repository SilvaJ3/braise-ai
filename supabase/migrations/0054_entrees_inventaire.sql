-- 0054 — L'inventaire : elle compte ce qu'elle a, l'application en déduit le mouvement.
--
-- Retour de terrain (19/09, soir) : « elle peut faire moins ou plus ». Trois cas, et le modèle
-- n'en connaissait que deux :
--   · moins, parce que c'est vendu    → VENTE   (facturable)
--   · moins, parce qu'on le reprend   → REPRISE (mouvement de stock, non facturable)
--   · plus,  parce qu'elle a reçu sans bon → ENTRÉE (correction de stock, ni vendu ni facturé)
--
-- Le cas « plus » arrive quand un réassort se fait sans passer par l'application. Le compter est
-- la seule façon d'avoir un stock juste — et ça l'apprend à l'artisane, qui voit qu'une livraison
-- lui a échappé.
--
-- Le restant = déposé + entré − vendu − repris. Le montant facturable = la valeur des ventes seules.

create or replace function public.boutique_etat(jeton_param text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
  v_periode date := date_trunc('month', current_date)::date;
  v_partenaires jsonb;
begin
  select l.id, l.email into v_lien from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;
  if v_lien.id is null then return jsonb_build_object('erreur', 'lien_invalide'); end if;
  update public.boutique_liens set dernier_acces = now() where id = v_lien.id;

  with paires as (
    select p.id as partenaire_id, p.user_id, p.boutique_id,
           coalesce(pe.nom, '') as artisan, coalesce(pe.delai_semaines, 2) as delai,
           (select b.nom from public.boutiques b where b.id = p.boutique_id) as boutique
      from public.boutique_lien_partenaires p
      left join public.profil_entreprise pe on pe.user_id = p.user_id
     where p.lien_id = v_lien.id and p.actif
  ), depose as (
    select p.partenaire_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.produit_id, max(dl.designation) as designation, sum(dl.quantite) as quantite,
           max(dl.prix_unitaire) as prix, max(d.date_depot) as dernier_depot
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null
     group by p.partenaire_id, 2, dl.produit_id
  ), bouge as (
    select p.partenaire_id, (ligne->>'cle') as cle,
           sum(coalesce((ligne->>'ventes')::numeric, (ligne->>'quantite')::numeric, 0)) as vendu,
           sum(coalesce((ligne->>'reprises')::numeric, 0)) as repris,
           sum(coalesce((ligne->>'entrees')::numeric, 0)) as entre
      from paires p
      join public.declarations_ventes dv on dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
      cross join lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.statut <> 'corrigee'
     group by p.partenaire_id, 2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'partenaire_id', p.partenaire_id, 'artisan', p.artisan, 'boutique', p.boutique,
      'delai_semaines', p.delai,
      'deja_declare', exists (select 1 from public.declarations_ventes dv
                               where dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
                                 and dv.periode = v_periode),
      'pieces', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'cle', d.cle, 'produit_id', d.produit_id, 'designation', d.designation,
                 'prix', d.prix, 'depose', d.quantite,
                 'vendu', coalesce(b.vendu, 0), 'repris', coalesce(b.repris, 0),
                 'entre', coalesce(b.entre, 0),
                 'reste', d.quantite + coalesce(b.entre, 0) - coalesce(b.vendu, 0) - coalesce(b.repris, 0),
                 'dernier_depot', d.dernier_depot)
               order by d.designation)
          from depose d left join bouge b on b.partenaire_id = d.partenaire_id and b.cle = d.cle
         where d.partenaire_id = p.partenaire_id), '[]'::jsonb)
    ) order by p.artisan), '[]'::jsonb)
    into v_partenaires
    from paires p;

  return jsonb_build_object('email', v_lien.email, 'periode', v_periode, 'partenaires', v_partenaires);
end;
$$;

create or replace function public.boutique_declarer(
  jeton_param text, partenaire_param uuid, lignes_param jsonb, note_param text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien uuid; v_user uuid; v_boutique uuid;
  v_periode date := date_trunc('month', current_date)::date;
  v_total numeric(10,2) := 0; v_valeur_reprises numeric(10,2) := 0;
  v_entree jsonb; v_propre jsonb := '[]'::jsonb; v_id uuid;
  v_ventes numeric; v_reprises numeric; v_entrees numeric; v_cle text; v_pid uuid;
  v_designation text; v_prix numeric; v_depose numeric; v_deja numeric;
  v_alerte_ligne boolean; v_alerte boolean := false;
begin
  select l.id into v_lien from public.boutique_liens l where l.jeton = jeton_param and l.actif;
  if v_lien is null then return jsonb_build_object('erreur', 'lien_invalide'); end if;

  select p.user_id, p.boutique_id into v_user, v_boutique
    from public.boutique_lien_partenaires p
   where p.id = partenaire_param and p.lien_id = v_lien and p.actif;
  if v_user is null then return jsonb_build_object('erreur', 'partenaire_inconnu'); end if;

  if lignes_param is null or jsonb_typeof(lignes_param) <> 'array' or jsonb_array_length(lignes_param) = 0 then
    return jsonb_build_object('erreur', 'aucune_vente');
  end if;

  for v_entree in select * from jsonb_array_elements(lignes_param) loop
    v_ventes   := coalesce((v_entree->>'ventes')::numeric, (v_entree->>'quantite')::numeric, 0);
    v_reprises := coalesce((v_entree->>'reprises')::numeric, 0);
    v_entrees  := coalesce((v_entree->>'entrees')::numeric, 0);
    v_cle := nullif(btrim(v_entree->>'cle'), '');
    continue when v_cle is null or (v_ventes <= 0 and v_reprises <= 0 and v_entrees <= 0);

    select max(dl.designation), max(dl.prix_unitaire), max(dl.produit_id::text)::uuid
      into v_designation, v_prix, v_pid
      from public.depot_lignes dl join public.depots d on d.id = dl.depot_id
     where d.user_id = v_user and d.boutique_id = v_boutique
       and coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) = v_cle;
    continue when v_designation is null;   -- jamais déposé chez cette boutique : ligne refusée

    select coalesce(sum(dl.quantite), 0) into v_depose
      from public.depot_lignes dl join public.depots d on d.id = dl.depot_id
     where d.user_id = v_user and d.boutique_id = v_boutique and d.archived_at is null
       and coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) = v_cle;

    select coalesce(sum(coalesce((ligne->>'ventes')::numeric, (ligne->>'quantite')::numeric, 0)
                      + coalesce((ligne->>'reprises')::numeric, 0)
                      - coalesce((ligne->>'entrees')::numeric, 0)), 0) into v_deja
      from public.declarations_ventes dv, lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.user_id = v_user and dv.boutique_id = v_boutique
       and dv.periode <> v_periode and dv.statut <> 'corrigee' and (ligne->>'cle') = v_cle;

    -- Le signalement ne concerne que ce qui sort sans expliquer une entrée. Une entrée, elle,
    -- est une correction : elle n'a rien à justifier.
    v_alerte_ligne := (v_ventes + v_reprises) > (coalesce(v_depose, 0) - coalesce(v_deja, 0) + v_entrees);
    v_alerte := v_alerte or v_alerte_ligne;

    v_total := v_total + round(v_ventes * coalesce(v_prix, 0), 2);
    v_valeur_reprises := v_valeur_reprises + round(v_reprises * coalesce(v_prix, 0), 2);
    v_propre := v_propre || jsonb_build_object(
      'cle', v_cle, 'produit_id', v_pid, 'designation', v_designation,
      'prix_unitaire', coalesce(v_prix, 0),
      'ventes', v_ventes, 'reprises', v_reprises, 'entrees', v_entrees,
      'disponible', coalesce(v_depose, 0) - coalesce(v_deja, 0) + v_entrees,
      'alerte', v_alerte_ligne);
  end loop;

  if jsonb_array_length(v_propre) = 0 then return jsonb_build_object('erreur', 'aucune_vente'); end if;

  insert into public.declarations_ventes (user_id, boutique_id, periode, lignes, total, note)
  values (v_user, v_boutique, v_periode, v_propre, v_total, nullif(trim(note_param), ''))
  on conflict (user_id, boutique_id, periode)
  do update set lignes = excluded.lignes, total = excluded.total, note = excluded.note,
                declare_le = now(), statut = 'declaree'
  returning id into v_id;

  return jsonb_build_object('ok', true, 'declaration_id', v_id, 'periode', v_periode,
    'facturable', v_total, 'valeur_reprises', v_valeur_reprises, 'alerte', v_alerte);
end;
$$;
