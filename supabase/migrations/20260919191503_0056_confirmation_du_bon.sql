-- 0056 — Le stock chez la boutique s'actualise à la confirmation de réception du bon.
--
-- Décision du 19/09 au soir : « si bon de dépôt est confirmé et signé, alors on actualise le stock
-- côté artisan ». Ce n'est donc pas l'envoi qui fait entrer les pièces dans le stock de la
-- boutique — c'est le moment où elle confirme les avoir reçues.
--
-- C'est plus juste ainsi, et ça règle un cas réel : un bon signé à l'atelier puis perdu en route
-- ne doit pas exister dans le stock de quelqu'un qui ne l'a jamais vu. La boutique confirme, et
-- c'est cette date-là qui fait foi.
--
-- Avant confirmation : le bon apparaît dans la page comme « bon à confirmer », avec ses lignes.
-- Après : il entre dans le stock, et les déclarations peuvent porter dessus.

alter table public.depots
  add column if not exists confirme_le timestamptz;

-- --- Confirmer un bon reçu (appelé par la boutique, depuis son lien) -------------------------
create or replace function public.boutique_confirmer_bon(jeton_param text, bon_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien uuid;
  v_bon uuid;
  v_numero text;
begin
  select l.id into v_lien from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;
  if v_lien is null then return jsonb_build_object('erreur', 'lien_invalide'); end if;

  -- Le bon doit appartenir à un couple rattaché à CE lien, et avoir été validé par l'artisan.
  select d.id, d.numero into v_bon, v_numero
    from public.depots d
    join public.boutique_lien_partenaires p
      on p.user_id = d.user_id and p.boutique_id = d.boutique_id
   where d.id = bon_param
     and p.lien_id = v_lien
     and p.actif
     and d.archived_at is null
     and d.statut in ('envoye', 'signe');

  if v_bon is null then
    return jsonb_build_object('erreur', 'bon_inconnu');
  end if;

  update public.depots set confirme_le = coalesce(confirme_le, now()) where id = v_bon;

  return jsonb_build_object('ok', true, 'bon', v_numero);
end;
$$;

-- --- L'état tel que la boutique le voit, avec les bons à confirmer -------------------------
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
    -- Seuls les bons CONFIRMÉS par la boutique comptent dans son stock : un bon signé à l'atelier
    -- mais jamais reçu ne peut pas figurer chez elle.
    select p.partenaire_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.produit_id, max(dl.designation) as designation, sum(dl.quantite) as quantite,
           max(dl.prix_unitaire) as prix, max(d.date_depot) as dernier_depot
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
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
  ), a_confirmer as (
    select p.partenaire_id,
           jsonb_agg(jsonb_build_object(
             'bon_id', d.id, 'numero', d.numero, 'date', d.date_depot,
             'pieces', (select coalesce(sum(l.quantite), 0) from public.depot_lignes l where l.depot_id = d.id),
             'lignes', (select coalesce(jsonb_agg(jsonb_build_object(
                          'designation', l.designation, 'quantite', l.quantite)
                          order by l.position), '[]'::jsonb)
                          from public.depot_lignes l where l.depot_id = d.id)
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

revoke all on function public.boutique_confirmer_bon(text, uuid) from public;
grant execute on function public.boutique_confirmer_bon(text, uuid) to anon, authenticated;
