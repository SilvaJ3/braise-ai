-- Retour arrière de la migration 0087 : les trois fonctions telles qu'elles étaient EN PRODUCTION le 05/10/2026
-- (extraites de la base par pg_get_functiondef, avant toute application de la 0087).
--
-- À rejouer dans cet ordre si la 0087 doit être annulée :
--   1. ce fichier (restaure boutique_commander, boutique_declarer, boutique_contester_bon) ;
--   2. puis les deux utilitaires que la 0087 a créés, devenus inutiles :
--        drop function public.boutique_quantite(text);
--        drop function public.boutique_texte(text, int);
-- Les supprimer AVANT l'étape 1 casserait les trois fonctions, qui les appellent.
--
-- Les droits ne bougent pas : `create or replace` les conserve (les RPC boutique_* restent appelables avec un jeton).
-- Ce fichier n'est PAS une migration : il n'est pas dans supabase/migrations et ne s'applique pas tout seul.

CREATE OR REPLACE FUNCTION public.boutique_commander(jeton_param text, partenaire_param uuid, lignes_param jsonb, note_param text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lien uuid;
  v_user uuid;
  v_boutique uuid;
  v_entree jsonb;
  v_id uuid;
  v_delai int;
  v_echeance date;
  v_nb int := 0;
  v_qte numeric;
  v_cle text;
  v_pid uuid;
  v_designation text;
begin
  select l.id into v_lien from public.boutique_liens l where l.jeton = jeton_param and l.actif;
  if v_lien is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;
  select p.user_id, p.boutique_id into v_user, v_boutique
    from public.boutique_lien_partenaires p
   where p.id = partenaire_param and p.lien_id = v_lien and p.actif;
  if v_user is null then
    return jsonb_build_object('erreur', 'partenaire_inconnu');
  end if;
  if lignes_param is null or jsonb_typeof(lignes_param) <> 'array' or jsonb_array_length(lignes_param) = 0 then
    return jsonb_build_object('erreur', 'aucune_demande');
  end if;
  select coalesce(delai_semaines, 2) into v_delai from public.profil_entreprise where user_id = v_user;
  v_echeance := current_date + make_interval(weeks => coalesce(v_delai, 2));
  -- La demande devient une commande boutique ordinaire, au premier de ses statuts : elle arrive
  -- là où l'artisan travaille déjà.
  insert into public.commandes (user_id, type, boutique_id, date_echeance, statut, notes)
  values (v_user, 'boutique', v_boutique, v_echeance, 'demande', nullif(trim(note_param), ''))
  returning id into v_id;
  for v_entree in select * from jsonb_array_elements(lignes_param) loop
    v_qte := coalesce((v_entree->>'quantite')::numeric, 0);
    v_cle := nullif(btrim(v_entree->>'cle'), '');
    continue when v_qte <= 0 or v_cle is null;
    -- Les deux cibles sont remises à zéro À CHAQUE TOUR : sans ça, une clé sans résultat garde la
    -- valeur du tour précédent, et la demande part avec la désignation d'une autre pièce.
    v_designation := null;
    v_pid := null;
    -- Le CATALOGUE d'abord : « produit:<uuid> » désigne un produit actif de l'artisan, même si
    -- cette boutique ne l'a jamais reçu — c'est le cas « je voudrais tester cette nouveauté ».
    if v_cle ~ '^produit:[0-9a-fA-F-]{36}$' then
      select pr.nom, pr.id into v_designation, v_pid
        from public.produits pr
       where pr.id = replace(v_cle, 'produit:', '')::uuid
         and pr.user_id = v_user
         and pr.actif;
    end if;
    -- Sinon, une pièce déjà reçue chez cette boutique : on garde le chemin d'origine.
    if v_designation is null then
      select max(dl.designation), max(dl.produit_id::text)::uuid into v_designation, v_pid
        from public.depot_lignes dl
        join public.depots d on d.id = dl.depot_id
       where d.user_id = v_user and d.boutique_id = v_boutique and coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) = v_cle;
    end if;
    continue when v_designation is null;
    insert into public.commande_lignes (user_id, commande_id, produit_id, designation, quantite, deja_en_stock, position)
    values (v_user, v_id, v_pid, v_designation, v_qte, false, v_nb);
    v_nb := v_nb + 1;
  end loop;
  if v_nb = 0 then
    delete from public.commandes where id = v_id;   -- rien de valide : on n'ouvre pas la commande
    return jsonb_build_object('erreur', 'aucune_demande');
  end if;
  perform public.notifier_artisan(
    v_user, 'reassort',
    jsonb_build_object('commande_id', v_id, 'boutique_id', v_boutique, 'lignes', v_nb)
  );
  return jsonb_build_object('ok', true, 'commande_id', v_id, 'echeance', v_echeance, 'lignes', v_nb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.boutique_declarer(jeton_param text, partenaire_param uuid, lignes_param jsonb, note_param text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Une sortie sans entrée qui la justifie est signalée : à l'artisane de trancher.
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
  begin
    perform public.notifier_stock_mouvement(
      v_user, v_boutique, v_id, v_total, jsonb_array_length(v_propre), v_periode);
  exception when others then null;
  end;
  return jsonb_build_object('ok', true, 'declaration_id', v_id, 'periode', v_periode,
    'facturable', v_total, 'valeur_reprises', v_valeur_reprises, 'alerte', v_alerte);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.boutique_contester_bon(jeton_param text, bon_param uuid, message_param text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lien uuid;
  v_user uuid;
  v_boutique uuid;
  v_numero text;
  v_message text := nullif(btrim(message_param), '');
  v_id uuid;
begin
  select l.id into v_lien from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;
  if v_lien is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;
  if v_message is null or char_length(v_message) < 3 then
    return jsonb_build_object('erreur', 'message_vide');
  end if;
  -- Le bon doit appartenir à un couple rattaché à CE lien : un identifiant venu de l'appelant ne
  -- vaut rien tant qu'il n'a pas été retrouvé par le jeton (même règle que boutique_confirmer_bon).
  select p.user_id, p.boutique_id, d.numero into v_user, v_boutique, v_numero
    from public.depots d
    join public.boutique_lien_partenaires p
      on p.user_id = d.user_id and p.boutique_id = d.boutique_id
   where d.id = bon_param
     and p.lien_id = v_lien
     and p.actif
     and d.archived_at is null
     and d.statut in ('envoye', 'signe');
  if v_user is null then
    return jsonb_build_object('erreur', 'bon_inconnu');
  end if;
  -- Le même texte, deux fois, tant que l'artisane ne l'a pas vu : une seule trace.
  select c.id into v_id
    from public.bon_contestations c
   where c.depot_id = bon_param
     and c.vu_le is null
     and btrim(c.message) = v_message
   limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'contestation_id', v_id, 'bon', v_numero, 'deja', true);
  end if;
  insert into public.bon_contestations (user_id, boutique_id, depot_id, message)
  values (v_user, v_boutique, bon_param, left(v_message, 2000))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'contestation_id', v_id, 'bon', v_numero);
end;
$function$
;

