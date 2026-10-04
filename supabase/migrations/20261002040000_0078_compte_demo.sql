-- 0078 — Le compte de démonstration : un drapeau distinct du compte de test (décision de JSB, 02/10/2026)
--
-- POURQUOI DEUX DRAPEAUX. JSB a nommé deux choses qui n'ont pas les mêmes conséquences :
--   · le COMPTE DE DÉMONSTRATION (« demo ») — l'outil qu'on montre à quelqu'un. Il garde l'accès, et
--     AUCUN de ses envois ne part vers un tiers : les destinataires d'une boutique sont remplacés par
--     l'adresse de son propriétaire, qui voit ainsi ce qui serait parti. C'est un environnement de
--     démonstration, pas un client.
--   · le COMPTE DE TEST (« est_test », 0075) — gratuit, marqué comme testeur, et destiné à devenir un
--     compte utilisateur. Ses mails partent normalement : un testeur qu'on rend muet croit l'app
--     cassée, et il ne peut plus devenir un utilisateur.
-- Jusqu'ici un seul drapeau portait les deux, et rien ne neutralisait les envois : il n'était lu qu'à
-- un endroit, `_shared/essai.ts` (la porte de l'accès).
--
-- Cette migration n'écrit AUCUNE donnée : le drapeau se pose compte par compte, avec l'accord de JSB.
-- Un `update` de compte est un geste, pas une migration.

alter table public.assistant_profil
  add column if not exists demo boolean not null default false;

comment on column public.assistant_profil.demo is
  'Compte de démonstration : accès ouvert, et aucun envoi ne part vers un tiers (les destinataires boutique sont remplacés par l''adresse du propriétaire du compte). Distinct de est_test, qui marque un compte de test destiné à devenir un utilisateur et qui, lui, envoie normalement.';

-- `comptes_admin()` rend le drapeau : l'écran doit dire « démonstration » là où il disait « compte de
-- test ». Le type de retour change, donc la fonction est retirée avant d'être recréée — et le `grant`
-- est reposé : un `drop function` emporte les droits, et l'écran répondrait « permission denied ».
drop function if exists public.comptes_admin(integer);

create or replace function public.comptes_admin(p_limite integer default 100)
returns table (
  user_id uuid,
  email text,
  plan text,
  abonnement_statut text,
  essai_fin timestamp with time zone,
  acces_gratuit boolean,
  acces_gratuit_depuis timestamp with time zone,
  est_test boolean,
  demo boolean,
  ouvert_le timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
begin
  if not public.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  return query
    select p.user_id, u.email::text, p.plan, p.abonnement_statut, p.essai_fin,
           p.acces_gratuit, p.acces_gratuit_depuis, p.est_test, p.demo, u.created_at
      from public.assistant_profil p
      join auth.users u on u.id = p.user_id
     order by u.created_at desc
     limit v_limite;
end;
$function$;

grant execute on function public.comptes_admin(integer) to authenticated;

-- Le rappel mensuel des boutiques (cron) ne sélectionne plus les liens d'un compte de démonstration.
--
-- POURQUOI ICI ET PAS DANS LA FONCTION EDGE. La sélection des destinataires est faite par cette
-- requête, et c'est donc le seul endroit où l'écarter garantit qu'aucun mail ne part : filtrer plus
-- loin laisserait la ligne réserver son bail, échouer, et se reprendre chaque jour. Le corps est
-- repris de la version SERVIE (`pg_get_functiondef`), pas du dépôt : une branche appliquée mais non
-- fusionnée peut avoir changé la fonction.
--
-- `create or replace` conserve les droits existants (seul `service_role` peut l'appeler).

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
       -- Un compte de démonstration n'envoie RIEN à une boutique : ses liens ne sont même pas
       -- sélectionnés (décision de JSB, 02/10/2026). Le rappel serait un mail de plus, à une
       -- adresse qu'il ne possède pas forcément, et « aucun envoi ne sort d'un compte de démo »
       -- est la règle du produit. Écarter la ligne ici vaut mieux que de la laisser prendre son
       -- bail pour la sauter plus loin : rien n'est réservé, rien ne se reprend demain.
       and not exists (
         select 1 from public.assistant_profil a
          where a.user_id = p.user_id and a.demo
       )
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
$function$;
