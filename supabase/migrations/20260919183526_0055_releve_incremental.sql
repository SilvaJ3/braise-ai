-- 0055 — Un relevé s'ajoute, il ne remplace pas.
--
-- Décision du 19/09 au soir : le relevé porte sur « ce qui est parti depuis le dernier relevé »,
-- pas sur le total du mois. La boutique ajoute donc du nouveau à chaque fois — c'est ce qui lui
-- demande le moins d'effort, et c'est ainsi qu'elle travaille déjà à la main.
--
-- Le schéma précédent gardait UNE ligne par (artisan, boutique, mois) et écrasait la précédente.
-- Conséquence trouvée par test : une entrée de 4 pièces reçues sans bon disparaissait à la
-- déclaration suivante — le stock annonçait 2 alors qu'il y en avait 6.
--
-- Désormais chaque envoi est une ligne datée qui s'ajoute. Le total du mois, c'est la somme des
-- lignes du mois ; et l'historique montre chaque passage (« inventaire du 30/09 »), ce qui est
-- exactement ce que la boutique veut pouvoir consulter.
--
-- L'unicité par mois disparaît : deux envois le même jour sont légitimes (une vente le matin,
-- une reprise l'après-midi).

alter table public.declarations_ventes
  drop constraint if exists declarations_ventes_user_id_boutique_id_periode_key;

create index if not exists declarations_ventes_periode_idx
  on public.declarations_ventes (user_id, boutique_id, periode);

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
  v_designation text; v_prix numeric; v_stock numeric; v_deja numeric;
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

    -- Le stock disponible AVANT cet envoi, tous envois confondus (c'est la somme qui compte).
    select coalesce(sum(dl.quantite), 0) into v_stock
      from public.depot_lignes dl join public.depots d on d.id = dl.depot_id
     where d.user_id = v_user and d.boutique_id = v_boutique and d.archived_at is null
       and coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) = v_cle;

    select coalesce(sum(coalesce((ligne->>'ventes')::numeric, (ligne->>'quantite')::numeric, 0)
                      + coalesce((ligne->>'reprises')::numeric, 0)
                      - coalesce((ligne->>'entrees')::numeric, 0)), 0) into v_deja
      from public.declarations_ventes dv, lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.user_id = v_user and dv.boutique_id = v_boutique
       and dv.statut <> 'corrigee' and (ligne->>'cle') = v_cle;

    -- Une sortie sans entrée qui la justifie est signalée : à l'artisan de trancher.
    v_alerte_ligne := (v_ventes + v_reprises) > (coalesce(v_stock, 0) - coalesce(v_deja, 0) + v_entrees);
    v_alerte := v_alerte or v_alerte_ligne;

    v_total := v_total + round(v_ventes * coalesce(v_prix, 0), 2);
    v_valeur_reprises := v_valeur_reprises + round(v_reprises * coalesce(v_prix, 0), 2);
    v_propre := v_propre || jsonb_build_object(
      'cle', v_cle, 'produit_id', v_pid, 'designation', v_designation,
      'prix_unitaire', coalesce(v_prix, 0),
      'ventes', v_ventes, 'reprises', v_reprises, 'entrees', v_entrees,
      'disponible', coalesce(v_stock, 0) - coalesce(v_deja, 0) + v_entrees,
      'alerte', v_alerte_ligne);
  end loop;

  if jsonb_array_length(v_propre) = 0 then return jsonb_build_object('erreur', 'aucune_vente'); end if;

  -- Un envoi = une ligne datée. Rien n'est écrasé.
  insert into public.declarations_ventes (user_id, boutique_id, periode, lignes, total, note)
  values (v_user, v_boutique, v_periode, v_propre, v_total, nullif(trim(note_param), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'declaration_id', v_id, 'periode', v_periode,
    'facturable', v_total, 'valeur_reprises', v_valeur_reprises, 'alerte', v_alerte);
end;
$$;
