-- 0059 — Côté artisan : ce qu'il voit de ses boutiques, et ce qu'il peut en faire.
--
-- Jusqu'ici la boucle n'allait que dans un sens : la boutique déclarait, l'artisan recevait une
-- commande. Il manquait trois choses, toutes côté artisan :
--
--  1. voir ce qui reste chez chaque boutique (le stock se calcule, il ne se saisit pas) ;
--  2. voir ce que la boutique a déclaré, et le VALIDER ou le CORRIGER — avec la trace de qui a
--     touché quoi (décision du 19/09) ;
--  3. récupérer le lien de la boutique, celui qu'elle transmet et qu'elle peut couper.
--
-- Aucune de ces fonctions ne prend d'identifiant de compte en paramètre : l'artisan vient de
-- `auth.uid()`. Le lien, lui, se coupe en désactivant le rattachement — la boutique garde son
-- adresse, elle perd l'accès.

create or replace function public.mes_boutiques_etat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_resultat jsonb;
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;

  with mes_boutiques as (
    select b.id, b.nom, b.mode, b.actif,
           l.jeton,
           l.actif as lien_actif,
           (select p.id from public.boutique_lien_partenaires p
             where p.user_id = v_user and p.boutique_id = b.id) as partenaire_id
      from public.boutiques b
      left join public.boutique_lien_partenaires p0
        on p0.boutique_id = b.id and p0.user_id = v_user
      left join public.boutique_liens l on l.id = p0.lien_id
     where b.user_id = v_user and b.actif
     order by b.nom
  ), depose as (
    -- Le stock chez la boutique : uniquement les bons qu'elle a CONFIRMÉS.
    select mb.id as boutique_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.produit_id, max(dl.designation) as designation, sum(dl.quantite) as quantite,
           max(dl.prix_unitaire) as prix
      from mes_boutiques mb
      join public.depots d on d.boutique_id = mb.id and d.user_id = v_user
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
     group by mb.id, 2, dl.produit_id
  ), bouge as (
    select dv.boutique_id, (ligne->>'cle') as cle,
           sum(coalesce((ligne->>'ventes')::numeric, (ligne->>'quantite')::numeric, 0)) as vendu,
           sum(coalesce((ligne->>'reprises')::numeric, 0)) as repris,
           sum(coalesce((ligne->>'entrees')::numeric, 0)) as entre
      from public.declarations_ventes dv
      cross join lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.user_id = v_user and dv.statut <> 'corrigee'
     group by dv.boutique_id, 2
  ), declarations as (
    select dv.boutique_id,
           jsonb_agg(jsonb_build_object(
             'id', dv.id, 'periode', dv.periode, 'statut', dv.statut, 'note', dv.note,
             'declare_le', dv.declare_le, 'facturable', dv.total,
             'ventes', (select coalesce(sum((l->>'ventes')::numeric), 0) from jsonb_array_elements(dv.lignes) l),
             'reprises', (select coalesce(sum((l->>'reprises')::numeric), 0) from jsonb_array_elements(dv.lignes) l),
             'entrees', (select coalesce(sum((l->>'entrees')::numeric), 0) from jsonb_array_elements(dv.lignes) l),
             'alerte', (select coalesce(bool_or((l->>'alerte')::boolean), false) from jsonb_array_elements(dv.lignes) l)
           ) order by dv.declare_le desc) as liste
      from public.declarations_ventes dv
     where dv.user_id = v_user
     group by dv.boutique_id
  ), en_attente as (
    select d.boutique_id, count(*)::int as nb
      from public.depots d
     where d.user_id = v_user and d.archived_at is null
       and d.statut in ('envoye', 'signe') and d.confirme_le is null
     group by d.boutique_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', mb.id, 'nom', mb.nom, 'mode', mb.mode,
      'jeton', mb.jeton, 'lien_actif', coalesce(mb.lien_actif, false),
      'bons_en_attente_de_confirmation', coalesce(ea.nb, 0),
      'pieces', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'cle', d.cle, 'produit_id', d.produit_id, 'designation', d.designation,
                 'prix', d.prix, 'depose', d.quantite,
                 'vendu', coalesce(b.vendu, 0), 'repris', coalesce(b.repris, 0),
                 'entre', coalesce(b.entre, 0),
                 'reste', d.quantite + coalesce(b.entre, 0) - coalesce(b.vendu, 0) - coalesce(b.repris, 0))
               order by d.designation)
          from depose d left join bouge b on b.boutique_id = d.boutique_id and b.cle = d.cle
         where d.boutique_id = mb.id), '[]'::jsonb),
      'declarations', coalesce((select dc.liste from declarations dc where dc.boutique_id = mb.id), '[]'::jsonb)
    ) order by mb.nom), '[]'::jsonb)
    into v_resultat
    from mes_boutiques mb
    left join en_attente ea on ea.boutique_id = mb.id;

  return jsonb_build_object('boutiques', v_resultat);
end;
$$;

-- --- Valider ou corriger un relevé ------------------------------------------------------------
create or replace function public.corriger_declaration(
  declaration_param uuid,
  statut_param text,
  note_param text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;

  if statut_param not in ('validee', 'corrigee', 'declaree') then
    return jsonb_build_object('erreur', 'statut_inconnu');
  end if;

  update public.declarations_ventes
     set statut = statut_param,
         note = coalesce(nullif(btrim(note_param), ''), note)
   where id = declaration_param and user_id = v_user
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('erreur', 'declaration_inconnue');
  end if;

  return jsonb_build_object('ok', true, 'declaration_id', v_id, 'statut', statut_param);
end;
$$;

-- --- Couper l'accès d'une boutique (le lien cesse de fonctionner) -----------------------------
create or replace function public.couper_lien_boutique(boutique_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_nb int;
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;
  if not exists (select 1 from public.boutiques b where b.id = boutique_param and b.user_id = v_user) then
    return jsonb_build_object('erreur', 'boutique_inconnue');
  end if;

  update public.boutique_lien_partenaires
     set actif = false
   where user_id = v_user and boutique_id = boutique_param;
  get diagnostics v_nb = row_count;

  return jsonb_build_object('ok', true, 'rattachements_coupes', v_nb);
end;
$$;

revoke all on function public.mes_boutiques_etat() from public;
revoke all on function public.corriger_declaration(uuid, text, text) from public;
revoke all on function public.couper_lien_boutique(uuid) from public;
grant execute on function public.mes_boutiques_etat() to authenticated;
grant execute on function public.corriger_declaration(uuid, text, text) to authenticated;
grant execute on function public.couper_lien_boutique(uuid) to authenticated;
