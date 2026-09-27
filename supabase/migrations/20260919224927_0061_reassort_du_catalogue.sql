-- 0061 — Le réassort d'une pièce que la boutique n'a jamais reçue.
--
-- Le trou : `boutique_commander` ne résolvait chaque ligne que dans les bons de dépôt DÉJÀ reçus
-- par cette boutique (« produit:<id> » ou « nom:<designation> »), et écartait le reste en silence.
-- Une boutique qui voulait tester une nouveauté n'avait donc aucun chemin : la demande partait,
-- sans la pièce, ou ne partait pas du tout.
--
-- Ce que fait cette migration :
--   1. `boutique_etat` rend en plus le CATALOGUE — les produits actifs de l'artisan que cette
--      boutique n'a jamais eus (nom, prix, clé). Signature inchangée, la page en ligne continue de
--      fonctionner : elle ignore simplement une clé qu'elle ne lit pas.
--   2. `boutique_commander` accepte une clé « produit:<uuid> » résolue dans `produits` (actif, de
--      CET artisan) avant de retomber sur le chemin d'origine, et pose `deja_en_stock` à faux
--      explicitement (une nouveauté est à produire, sauf si l'artisan en a déjà en stock).
--
-- Aucune signature ne change, aucun écran existant ne casse : une boutique ne voit que le
-- catalogue de SON artisan, et seulement les produits actifs.

-- --- 1. Le catalogue, dans l'état que la boutique reçoit déjà ---------------------------------
CREATE OR REPLACE FUNCTION public.boutique_etat(jeton_param text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
    -- Seuls les bons CONFIRMÉS comptent : un bon signé à l'atelier mais jamais reçu n'est pas
    -- dans le stock de la boutique.
    select p.partenaire_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.produit_id, max(dl.designation) as designation, sum(dl.quantite) as quantite,
           max(dl.prix_unitaire) as prix, max(d.date_depot) as dernier_depot
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
     group by p.partenaire_id, 2, dl.produit_id
  ), derniere as (
    -- Ce qu'elle a reçu la dernière fois, par pièce : la référence du réassort.
    select distinct on (p.partenaire_id, coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))))
           p.partenaire_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.quantite as derniere_quantite
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
     order by p.partenaire_id,
              coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))),
              d.date_depot desc, dl.position desc
  ), catalogue as (
    -- Les produits ACTIFS de l'artisan que cette boutique n'a encore jamais eus : de quoi demander
    -- une pièce qu'elle n'a jamais reçue (tester une nouveauté). Ce qu'elle a déjà est plus haut,
    -- dans la liste des pièces, avec la quantité de la dernière fois.
    select p.partenaire_id,
           jsonb_agg(jsonb_build_object(
             'id', pr.id, 'nom', pr.nom, 'prix', pr.prix_vente,
             'cle', 'produit:' || pr.id::text) order by pr.nom) as liste
      from paires p
      join public.produits pr on pr.user_id = p.user_id and pr.actif
     where not exists (
       select 1 from depose d
        where d.partenaire_id = p.partenaire_id
          and (d.produit_id = pr.id
               or lower(btrim(d.designation)) = lower(btrim(pr.nom))))
     group by p.partenaire_id
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
  ), a_confirmer as (
    select p.partenaire_id,
           jsonb_agg(jsonb_build_object(
             'bon_id', d.id, 'numero', d.numero, 'date', d.date_depot,
             'pieces', (select coalesce(sum(l.quantite), 0) from public.depot_lignes l where l.depot_id = d.id),
             'lignes', (select coalesce(jsonb_agg(jsonb_build_object(
                          'designation', l.designation, 'quantite', l.quantite)
                          order by l.position), '[]'::jsonb)
                          from public.depot_lignes l where l.depot_id = d.id),
             -- Signalé par la boutique : elle dit que ce bon ne correspond pas. Le bon, lui,
             -- n'est pas modifié ; c'est à l'artisan de trancher.
             'conteste', exists (select 1 from public.bon_contestations c
                                  where c.depot_id = d.id and c.vu_le is null),
             'message_conteste', (select c.message from public.bon_contestations c
                                   where c.depot_id = d.id and c.vu_le is null
                                   order by c.cree_le desc limit 1)
           ) order by d.date_depot desc) as bons
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is null
     group by p.partenaire_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'partenaire_id', p.partenaire_id, 'artisan', p.artisan, 'boutique', p.boutique,
      'delai_semaines', p.delai,
      'deja_declare', exists (select 1 from public.declarations_ventes dv
                               where dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
                                 and dv.periode = v_periode),
      'a_confirmer', coalesce((select ac.bons from a_confirmer ac where ac.partenaire_id = p.partenaire_id), '[]'::jsonb),
      'catalogue', coalesce((select c.liste from catalogue c where c.partenaire_id = p.partenaire_id), '[]'::jsonb),
      'pieces', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'cle', d.cle, 'produit_id', d.produit_id, 'designation', d.designation,
                 'prix', d.prix, 'depose', d.quantite,
                 'derniere_quantite', coalesce(de.derniere_quantite, d.quantite),
                 'vendu', coalesce(b.vendu, 0), 'repris', coalesce(b.repris, 0),
                 'entre', coalesce(b.entre, 0),
                 'reste', d.quantite + coalesce(b.entre, 0) - coalesce(b.vendu, 0) - coalesce(b.repris, 0),
                 'dernier_depot', d.dernier_depot)
               order by d.designation)
          from depose d
          left join bouge b on b.partenaire_id = d.partenaire_id and b.cle = d.cle
          left join derniere de on de.partenaire_id = d.partenaire_id and de.cle = d.cle
         where d.partenaire_id = p.partenaire_id), '[]'::jsonb)
    ) order by p.artisan), '[]'::jsonb)
    into v_partenaires
    from paires p;

  return jsonb_build_object('email', v_lien.email, 'periode', v_periode, 'partenaires', v_partenaires);
end;
$$;


-- --- 2. La demande : une pièce du catalogue est acceptée comme les autres --------------------
CREATE OR REPLACE FUNCTION public.boutique_commander(jeton_param text, partenaire_param uuid, lignes_param jsonb, note_param text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
    -- valeur du tour précédent, et la demande part avec la désignation d'une autre pièce. (Le
    -- « max() » d'un agrégat rend bien une ligne vide, mais la garde ci-dessous teste la variable,
    -- pas la requête.)
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

  return jsonb_build_object('ok', true, 'commande_id', v_id, 'echeance', v_echeance, 'lignes', v_nb);
end;
$$;

