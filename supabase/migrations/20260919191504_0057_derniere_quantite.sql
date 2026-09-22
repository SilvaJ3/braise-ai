-- 0057 — La quantité du dernier dépôt, pour pré-remplir une demande de réassort.
--
-- Décision du 19/09 : quand la boutique demande un réassort, les quantités sont déjà remplies
-- avec ce qu'elle a reçu la dernière fois. Elle ajuste, elle ne ressaisit pas.
--
-- C'est le dernier bon qui donne la référence, pas le total : si un premier dépôt de 5 a été suivi
-- d'un dépôt de 3, c'est 3 qui est proposé — c'est le rythme le plus récent qui parle.

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
    select p.partenaire_id, p.user_id, p.boutique_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.produit_id, max(dl.designation) as designation, sum(dl.quantite) as quantite,
           max(dl.prix_unitaire) as prix, max(d.date_depot) as dernier_depot,
           -- Ce qu'elle a reçu la dernière fois pour cette pièce : la référence du réassort.
           (select dl2.quantite
              from public.depot_lignes dl2
              join public.depots d2 on d2.id = dl2.depot_id
             where d2.user_id = p.user_id
               and d2.boutique_id = p.boutique_id
               and d2.archived_at is null
               and d2.statut in ('envoye', 'signe')
               and d2.confirme_le is not null
               and coalesce('produit:' || dl2.produit_id::text, 'nom:' || lower(btrim(dl2.designation)))
                   = coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation)))
             order by d2.date_depot desc, dl2.position desc
             limit 1) as derniere_quantite
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
     group by p.partenaire_id, p.user_id, p.boutique_id, 4, dl.produit_id
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
                 'derniere_quantite', coalesce(d.derniere_quantite, 0),
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
