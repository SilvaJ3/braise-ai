-- 0087 — Les RPC publiques de la boutique (appelées avec un jeton, sans compte) se défendent mieux
-- (audit du 05/10/2026, relecture des définitions réelles de la prod).
--
-- Rien ne change pour une boutique honnête. Ce que ça ferme :
--
--   · `NaN` : `'NaN'::numeric <= 0` est FAUX, donc une quantité « NaN » passait le filtre, entrait dans
--     `declarations_ventes` et rendait NaN tous les cumuls de la pièce (reste, vendu, facturable) jusqu'à
--     ce que l'artisan marque la déclaration « corrigée ». La quantité est lue par `boutique_quantite` :
--     absente → NULL (on passe au champ suivant), illisible ou hors format → 0 (ligne ignorée, comme une
--     quantité nulle).
--   · Une liste de lignes sans limite : plus de 100 lignes, ou deux lignes pour la même pièce, sont refusées.
--   · `boutique_declarer` sans idempotence : un double clic créait deux déclarations et doublait le
--     facturable. Un verrou par (artisan, boutique) sérialise les appels, et le même envoi répété dans
--     les DIX SECONDES renvoie la déclaration déjà faite (`deja: true`). Fenêtre courte exprès : deux
--     déclarations réellement distinctes mais identiques (une tasse vendue, puis une autre une minute plus
--     tard) doivent rester deux déclarations — une fenêtre de deux minutes en aurait avalé une, et
--     Comptoir, qui note ses envois de son côté, l'aurait crue partie. Une vraie idempotence demanderait
--     une clé fournie par l'appelant ; ce serait changer la signature et la page `/boutique`.
--   · `boutique_commander` sans plafond : chaque appel créait une commande ET prévenait l'artisan (push,
--     mail). Au plus 20 demandes ouvertes par jour et par couple artisan–boutique.
--   · Le texte libre (note, message) part dans un mail « Braaise » : les liens `http(s)://` et `www.` sont
--     retirés, les espaces ramenés à un seul, la longueur bornée à 500 (2 000 pour une contestation).
--     C'est une ATTÉNUATION, pas un filtre d'hameçonnage : un domaine écrit nu (« arnaque.exemple »)
--     passe, et le texte vient toujours de la boutique, sous l'expéditeur Braaise.
--   · `boutique_contester_bon` : au plus 5 contestations non vues par bon.
--
-- `boutique_commander`, `boutique_declarer` et `boutique_contester_bon` sont reprises à l'identique des
-- définitions en production, aux lignes marquées « 0087 » près. `boutique_quantite` et `boutique_texte`
-- sont NOUVELLES : elles n'ont pas d'état antérieur. Pour revenir en arrière, rejouer les trois
-- définitions de production sauvegardées dans docs/retour-arriere-0087.sql, PUIS supprimer les deux
-- utilitaires (dans cet ordre : les trois fonctions les appellent).

create or replace function public.boutique_quantite(t text) returns numeric
language sql immutable set search_path = '' as $$
  select case when t is null then null
              when t ~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then t::numeric
              else 0 end
$$;

create or replace function public.boutique_texte(t text, maxi int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(regexp_replace(regexp_replace(btrim(coalesce(t, '')), '(https?://|www\.)\S+', '[lien retiré]', 'gi'), '\s+', ' ', 'g'), maxi), '')
$$;

-- Des utilitaires internes : appelés par les fonctions ci-dessous (propriétaire postgres), jamais par un client.
revoke all on function public.boutique_quantite(text) from public, anon, authenticated;
revoke all on function public.boutique_texte(text, int) from public, anon, authenticated;

create or replace function public.boutique_commander(jeton_param text, partenaire_param uuid, lignes_param jsonb, note_param text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- 0087 : une liste bornée, sans pièce en double.
  if jsonb_array_length(lignes_param) > 100 then
    return jsonb_build_object('erreur', 'trop_de_lignes');
  end if;
  if (select count(distinct nullif(btrim(e->>'cle'), '')) <> count(nullif(btrim(e->>'cle'), ''))
        from jsonb_array_elements(lignes_param) e) then
    return jsonb_build_object('erreur', 'cle_dupliquee');
  end if;
  -- 0087 : chaque demande prévient l'artisan (push + mail) ; au-delà de 20 par jour, c'est un abus.
  if (select count(*) from public.commandes c
       where c.user_id = v_user and c.boutique_id = v_boutique and c.type = 'boutique'
         and c.statut = 'demande' and c.created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('erreur', 'trop_de_demandes');
  end if;
  select coalesce(delai_semaines, 2) into v_delai from public.profil_entreprise where user_id = v_user;
  v_echeance := current_date + make_interval(weeks => coalesce(v_delai, 2));
  -- La demande devient une commande boutique ordinaire, au premier de ses statuts : elle arrive
  -- là où l'artisan travaille déjà.
  insert into public.commandes (user_id, type, boutique_id, date_echeance, statut, notes)
  values (v_user, 'boutique', v_boutique, v_echeance, 'demande', public.boutique_texte(note_param, 500))  -- 0087
  returning id into v_id;
  for v_entree in select * from jsonb_array_elements(lignes_param) loop
    v_qte := coalesce(public.boutique_quantite(v_entree->>'quantite'), 0);  -- 0087
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
$function$;

create or replace function public.boutique_declarer(jeton_param text, partenaire_param uuid, lignes_param jsonb, note_param text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lien uuid; v_user uuid; v_boutique uuid;
  v_periode date := date_trunc('month', current_date)::date;
  v_total numeric(10,2) := 0; v_valeur_reprises numeric(10,2) := 0;
  v_entree jsonb; v_propre jsonb := '[]'::jsonb; v_id uuid;
  v_ventes numeric; v_reprises numeric; v_entrees numeric; v_cle text; v_pid uuid;
  v_designation text; v_prix numeric; v_stock numeric; v_deja numeric;
  v_alerte_ligne boolean; v_alerte boolean := false;
  v_signature jsonb; v_dup uuid; v_dup_total numeric; v_dup_alerte boolean;
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
  -- 0087 : une liste bornée, sans pièce en double (deux lignes pour la même clé contournaient l'alerte de stock).
  if jsonb_array_length(lignes_param) > 100 then
    return jsonb_build_object('erreur', 'trop_de_lignes');
  end if;
  if (select count(distinct nullif(btrim(e->>'cle'), '')) <> count(nullif(btrim(e->>'cle'), ''))
        from jsonb_array_elements(lignes_param) e) then
    return jsonb_build_object('erreur', 'cle_dupliquee');
  end if;
  -- 0087 : un appel à la fois par (artisan, boutique) : deux envois simultanés ne lisent plus le même « déjà déclaré ».
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || v_boutique::text, 0));
  for v_entree in select * from jsonb_array_elements(lignes_param) loop
    -- 0087 : boutique_quantite écarte NaN, négatifs, exposants et valeurs hors format (ligne ignorée).
    v_ventes   := coalesce(public.boutique_quantite(v_entree->>'ventes'), public.boutique_quantite(v_entree->>'quantite'), 0);
    v_reprises := coalesce(public.boutique_quantite(v_entree->>'reprises'), 0);
    v_entrees  := coalesce(public.boutique_quantite(v_entree->>'entrees'), 0);
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
  -- 0087 : le MÊME envoi répété dans les DIX SECONDES (double clic, nouvel essai immédiat) est celui déjà
  -- fait : on le renvoie au lieu de le compter une seconde fois. Fenêtre courte exprès (voir l'en-tête) :
  -- deux déclarations réellement distinctes ne doivent jamais être confondues. On compare ce que la
  -- boutique a déclaré (pièce, ventes, reprises, entrées), pas le « disponible », qui change dès la première.
  select jsonb_agg(jsonb_build_object('cle', e->>'cle', 'v', e->'ventes', 'r', e->'reprises', 'n', e->'entrees') order by e->>'cle')
    into v_signature from jsonb_array_elements(v_propre) e;
  select dv.id, dv.total into v_dup, v_dup_total
    from public.declarations_ventes dv
   where dv.user_id = v_user and dv.boutique_id = v_boutique and dv.statut <> 'corrigee'
     and dv.declare_le > now() - interval '10 seconds'
     and (select jsonb_agg(jsonb_build_object('cle', e->>'cle', 'v', e->'ventes', 'r', e->'reprises', 'n', e->'entrees') order by e->>'cle')
            from jsonb_array_elements(dv.lignes) e) = v_signature
   limit 1;
  if v_dup is not null then
    select coalesce(bool_or((e->>'alerte')::boolean), false) into v_dup_alerte
      from public.declarations_ventes dv, lateral jsonb_array_elements(dv.lignes) e where dv.id = v_dup;
    return jsonb_build_object('ok', true, 'declaration_id', v_dup, 'periode', v_periode,
      'facturable', v_dup_total, 'valeur_reprises', v_valeur_reprises, 'alerte', v_dup_alerte, 'deja', true);
  end if;
  -- Un envoi = une ligne datée. Rien n'est écrasé.
  insert into public.declarations_ventes (user_id, boutique_id, periode, lignes, total, note)
  values (v_user, v_boutique, v_periode, v_propre, v_total, public.boutique_texte(note_param, 500))  -- 0087
  returning id into v_id;
  begin
    perform public.notifier_stock_mouvement(
      v_user, v_boutique, v_id, v_total, jsonb_array_length(v_propre), v_periode);
  exception when others then null;
  end;
  return jsonb_build_object('ok', true, 'declaration_id', v_id, 'periode', v_periode,
    'facturable', v_total, 'valeur_reprises', v_valeur_reprises, 'alerte', v_alerte);
end;
$function$;

create or replace function public.boutique_contester_bon(jeton_param text, bon_param uuid, message_param text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lien uuid;
  v_user uuid;
  v_boutique uuid;
  v_numero text;
  -- 0087 : borné AVANT le nettoyage (pas de regex sur un texte de plusieurs Mo), liens retirés, 2 000 signes au plus.
  v_message text := public.boutique_texte(left(message_param, 5000), 2000);
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
  -- 0087 : au plus 5 signalements non vus par bon.
  if (select count(*) from public.bon_contestations c where c.depot_id = bon_param and c.vu_le is null) >= 5 then
    return jsonb_build_object('erreur', 'deja_signale');
  end if;
  insert into public.bon_contestations (user_id, boutique_id, depot_id, message)
  values (v_user, v_boutique, bon_param, v_message)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'contestation_id', v_id, 'bon', v_numero);
end;
$function$;

-- Les droits sont ceux d'avant : `create or replace` ne les touche pas (public.boutique_* restent appelables avec un jeton).
