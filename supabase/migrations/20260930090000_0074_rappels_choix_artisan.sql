-- 0074 — les rappels de boutique : un choix de l'artisan, et jamais pour un achat ferme.
--
-- Deux verrous sont remplacés par un seul, et il est entre les mains de l'artisan.
--
-- 1. Jusqu'ici, un réglage produit (`reglages_produit.rappels_boutiques_actifs`) décidait pour
--    tout le monde, et une veille l'ouvrait dès qu'un mail de présentation partait. La veille a
--    armé sur le mauvais message (un mail de LIEN, pas de présentation) : quatre boutiques, dont
--    trois vraies, se sont retrouvées à un envoi près. Un réglage global ne peut pas porter une
--    décision qui appartient à chaque artisan.
--
-- 2. Le mode de la boutique n'était pas regardé : une boutique en achat ferme — les pièces sont
--    achetées, plus rien n'est en dépôt — recevait le même rappel qu'une boutique en dépôt-vente.
--
-- Ce que ce fichier pose :
--   · `boutique_liens.rappels_actifs`, faux par défaut, pour les liens existants comme nouveaux :
--     rien ne part tant que l'artisan ne l'a pas ouvert, boutique par boutique ;
--   · `rappels_boutiques_a_envoyer` ne retient que les partenaires dont la boutique est en
--     dépôt-vente, et les liens dont les rappels sont ouverts ;
--   · `regler_rappels_boutique(boutique, actif)` : le geste de l'artisan dans l'app, qui refuse
--     une boutique en achat ferme (il n'y a rien à rappeler) ;
--   · `mes_boutiques_etat()` rend le réglage, pour que l'écran dise la vérité.
--
-- Le coupe-circuit produit (`reglages_produit.rappels_boutiques_actifs`) reste : il ferme tout
-- d'un coup si besoin, mais il n'ouvre plus rien et plus personne ne l'ouvre automatiquement.

alter table public.boutique_liens
  add column if not exists rappels_actifs boolean not null default false;

comment on column public.boutique_liens.rappels_actifs is
  'Le rappel mensuel à cette boutique est ouvert. Faux par défaut : c''est l''artisan qui l''ouvre, dans l''app.';

-- La fonction est reprise de 0062 avec deux filtres de plus (0074).
CREATE OR REPLACE FUNCTION public.rappels_boutiques_a_envoyer(p_type text, p_mois date, p_reserver boolean DEFAULT true, p_nouveaux boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mois date := date_trunc('month', p_mois)::date;
  v_mois_prec date := (date_trunc('month', p_mois) - interval '1 month')::date;
  v_resultat jsonb;
begin
  if p_type is null or p_type not in ('rappel', 'relance') then
    return jsonb_build_object('erreur', 'type_inconnu');
  end if;
  if v_mois is null then
    return jsonb_build_object('erreur', 'mois_manquant');
  end if;

  with paires as (
    select p.id as partenaire_id, p.lien_id, p.user_id, p.boutique_id,
           coalesce(nullif(btrim(pe.nom), ''), 'Un artisan') as artisan,
           coalesce(nullif(btrim(pe.email), ''), '') as artisan_email
      from public.boutique_lien_partenaires p
      -- Le dépôt-vente seulement. Dans un achat ferme, la boutique a acheté les pièces : il n'y a
      -- ni déclaration de vente ni réassort à lui rappeler, un rappel y serait un contresens.
      join public.boutiques b on b.id = p.boutique_id and b.mode = 'depot_vente' and b.actif
      left join public.profil_entreprise pe on pe.user_id = p.user_id
     where p.actif
  ), depose as (
    -- Le stock chez la boutique : uniquement les bons qu'elle a CONFIRMÉS (0061).
    select p.partenaire_id, sum(dl.quantite) as quantite
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
     group by p.partenaire_id
  ), mouvements as (
    -- Le mois précédent (ce qu'elle a déclaré) et le cumul (pour le restant), en un seul passage.
    -- Les reprises n'ont jamais été des ventes, et une déclaration écartée ne compte pas (0053).
    select p.partenaire_id,
           sum(case when dv.periode = v_mois_prec
                    then coalesce((ligne->>'ventes')::numeric, (ligne->>'quantite')::numeric, 0)
                    else 0 end) as ventes_mois,
           sum(case when dv.periode = v_mois_prec
                    then coalesce((ligne->>'reprises')::numeric, 0) else 0 end) as reprises_mois,
           sum(case when dv.periode = v_mois_prec
                    then coalesce((ligne->>'entrees')::numeric, 0) else 0 end) as entrees_mois,
           sum(coalesce((ligne->>'ventes')::numeric, (ligne->>'quantite')::numeric, 0)) as vendu_cumul,
           sum(coalesce((ligne->>'reprises')::numeric, 0)) as repris_cumul,
           sum(coalesce((ligne->>'entrees')::numeric, 0)) as entre_cumul
      from paires p
      join public.declarations_ventes dv on dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
      cross join lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.statut <> 'corrigee'
     group by p.partenaire_id
  ), etat as (
    select p.lien_id, p.partenaire_id, p.artisan, p.artisan_email,
           coalesce(m.ventes_mois, 0) as ventes_mois,
           coalesce(m.reprises_mois, 0) as reprises_mois,
           coalesce(m.entrees_mois, 0) as entrees_mois,
           -- Ce qu'il lui reste d'après nos comptes : déposé + reçu sans bon − vendu − repris.
           -- Jamais négatif : un compte négatif voudrait dire qu'une déclaration dépasse ce qui a
           -- été déposé, et l'app le signale déjà à l'artisane (0052).
           greatest(coalesce(d.quantite, 0) + coalesce(m.entre_cumul, 0)
                    - coalesce(m.vendu_cumul, 0) - coalesce(m.repris_cumul, 0), 0) as restant,
           exists (select 1 from public.declarations_ventes dv
                    where dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
                      and dv.periode = v_mois and dv.statut <> 'corrigee') as declare_ce_mois
      from paires p
      left join depose d on d.partenaire_id = p.partenaire_id
      left join mouvements m on m.partenaire_id = p.partenaire_id
  ), cibles as (
    select e.lien_id,
           jsonb_agg(jsonb_build_object(
             'partenaire_id', e.partenaire_id,
             'artisan', e.artisan,
             'artisan_email', e.artisan_email,
             'ventes_mois', e.ventes_mois,
             'reprises_mois', e.reprises_mois,
             'entrees_mois', e.entrees_mois,
             'restant', e.restant,
             'declare_ce_mois', e.declare_ce_mois
           ) order by e.artisan) as partenaires,
           bool_or(not e.declare_ce_mois) as a_declarer
      from etat e
      join public.boutique_liens l on l.id = e.lien_id
     where l.actif
       -- Le choix de l'artisan, et lui seul : `rappels_actifs` vaut faux par défaut, pour les liens
       -- existants comme pour les nouveaux. Aucun réglage produit ni cron ne l'ouvre — c'est un
       -- geste de l'artisan dans l'app (0074).
       and l.rappels_actifs
       -- Un mail déjà PARTI ce mois-ci ferme la porte, pour de bon : c'est ici que « un seul mail
       -- par boutique et par mois » se tient, y compris en lecture seule (l'aperçu ne montre que
       -- ce qui partirait vraiment). Une ligne prise mais pas encore envoyée ne ferme rien : c'est
       -- le rattrapage d'un envoi échoué.
       and not exists (
         select 1 from public.boutique_rappels r
          where r.lien_id = e.lien_id and r.mois = v_mois and r.type = p_type
            and r.envoye_le is not null
       )
     group by e.lien_id
    -- La relance ne part que s'il manque quelque chose : au moins un artisan sans déclaration.
    having (p_type = 'rappel' or bool_or(not e.declare_ce_mois))
  ), neufs as (
    -- Rien n'est réservé quand on demande seulement à voir (`p_reserver = false`, l'aperçu) —
    -- et il faut l'écrire ICI, pas dans la requête finale : en PostgreSQL, une instruction
    -- modificatrice d'un WITH s'exécute de toute façon, même si le résultat n'est pas lu.
    insert into public.boutique_rappels (lien_id, mois, type, pris_le)
    select c.lien_id, v_mois, p_type, now()
      from cibles c
     where p_reserver
       and p_nouveaux
    on conflict (lien_id, mois, type) do nothing
    returning lien_id
  ), pris as (
    -- Le rattrapage : une ligne prise et jamais envoyée (échec, ou function tombée en route)
    -- redevient éligible au bout de dix minutes. Le bail évite deux envois simultanés.
    update public.boutique_rappels r
       set pris_le = now()
     where p_reserver
       and r.mois = v_mois and r.type = p_type and r.envoye_le is null
       and (r.pris_le is null or r.pris_le < now() - interval '10 minutes')
       and exists (select 1 from cibles c where c.lien_id = r.lien_id)
    returning r.lien_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lien_id', l.id,
           'email', l.email,
           'jeton', l.jeton,
           'a_declarer', c.a_declarer,
           'partenaires', c.partenaires
         ) order by l.email), '[]'::jsonb)
    into v_resultat
    from cibles c
    join public.boutique_liens l on l.id = c.lien_id
   where l.actif
     and (not p_reserver
          or l.id in (select lien_id from neufs union all select lien_id from pris));

  return jsonb_build_object(
    'ok', true,
    'type', p_type,
    'mois', v_mois,
    'mois_precedent', v_mois_prec,
    'reserve', p_reserver,
    'boutiques', v_resultat
  );
end;
$function$
;


-- Reprise de 0060 : la même fonction, plus le réglage des rappels (0074).
CREATE OR REPLACE FUNCTION public.mes_boutiques_etat()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           l.rappels_actifs,
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
  ), contestations as (
    -- « Ce bon ne correspond pas » : le message de la boutique, avec le bon qu'il vise. Le volume
    -- est celui d'un carnet de bord (quelques lignes), on rend tout.
    select c.boutique_id,
           count(*) filter (where c.vu_le is null)::int as non_vues,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'bon_id', c.depot_id,
             'numero', (select d.numero from public.depots d where d.id = c.depot_id),
             'date_depot', (select d.date_depot from public.depots d where d.id = c.depot_id),
             'message', c.message, 'cree_le', c.cree_le, 'vu_le', c.vu_le
           ) order by c.cree_le desc) as liste
      from public.bon_contestations c
     where c.user_id = v_user
     group by c.boutique_id
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
      'rappels_actifs', coalesce(mb.rappels_actifs, false),
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
      'declarations', coalesce((select dc.liste from declarations dc where dc.boutique_id = mb.id), '[]'::jsonb),
      'contestations', coalesce((select ct.liste from contestations ct where ct.boutique_id = mb.id), '[]'::jsonb),
      'contestations_non_vues', coalesce((select ct.non_vues from contestations ct where ct.boutique_id = mb.id), 0)
    ) order by mb.nom), '[]'::jsonb)
    into v_resultat
    from mes_boutiques mb
    left join en_attente ea on ea.boutique_id = mb.id;

  return jsonb_build_object('boutiques', v_resultat);
end;
$function$
;


-- --- Le geste de l'artisan ----------------------------------------------------------------------
-- Ouvre ou ferme le rappel mensuel de SA boutique. Refusé sans compte, refusé si la boutique n'est
-- pas la sienne, et refusé en achat ferme : on ne propose pas un réglage qui ne peut rien faire.
create or replace function public.regler_rappels_boutique(
  p_boutique uuid,
  p_actif boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_lien uuid;
  v_mode text;
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;
  if p_boutique is null then
    return jsonb_build_object('erreur', 'boutique_manquante');
  end if;

  select b.mode, p.lien_id into v_mode, v_lien
    from public.boutiques b
    join public.boutique_lien_partenaires p
      on p.boutique_id = b.id and p.user_id = v_user and p.actif
   where b.id = p_boutique and b.user_id = v_user
   limit 1;

  if v_lien is null then
    return jsonb_build_object('erreur', 'boutique_sans_lien');
  end if;
  if v_mode <> 'depot_vente' then
    return jsonb_build_object('erreur', 'achat_ferme');
  end if;

  update public.boutique_liens
     set rappels_actifs = coalesce(p_actif, false)
   where id = v_lien;

  return jsonb_build_object('ok', true, 'rappels_actifs', coalesce(p_actif, false));
end;
$$;

revoke all on function public.regler_rappels_boutique(uuid, boolean) from public, anon;
grant execute on function public.regler_rappels_boutique(uuid, boolean) to authenticated;

revoke all on function public.rappels_boutiques_a_envoyer(text, date, boolean, boolean) from public, anon, authenticated;
grant execute on function public.rappels_boutiques_a_envoyer(text, date, boolean, boolean) to service_role;

revoke all on function public.mes_boutiques_etat() from public, anon;
grant execute on function public.mes_boutiques_etat() to authenticated;
