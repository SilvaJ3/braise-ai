-- Le compte lit sa résiliation programmée (correctif du 03/10/2026).
--
-- Constaté en exerçant le portail Stripe pour de vrai, sur le compte « En retard » : après
-- « Annuler l'abonnement », le portail de Stripe affichait bien « Annulation le 26 oct. », mais
-- l'application continuait d'afficher « En retard » et, sur un compte actif, aurait continué
-- d'annoncer « prochain prélèvement le 26 octobre ».
--
-- La cause tient en deux morceaux, et les deux sont ici ou juste à côté :
--
--   1. Stripe NE change PAS le statut de l'abonnement quand on résilie en fin de période : il
--      reste `active` (ou `past_due` s'il y avait un impayé). Le statut seul ne peut donc pas dire
--      qu'une résiliation a eu lieu. Le drapeau `abonnement_annule` existe depuis la 0077, et
--      `stripe-webhook` l'écrit déjà (`champsDepuisAbonnement`). Vérifié en base : la colonne est
--      bien là et bien écrite par le webhook.
--
--   2. Mais `mon_compte()` ne le renvoyait pas. La colonne était lue par le cron des rappels
--      (`abonnements_a_rappeler`, qui s'en sert pour NE PAS envoyer « voici ce qui va être
--      prélevé » à quelqu'un qui a résilié) et par personne d'autre. L'écran ne pouvait donc pas
--      la voir, même juste.
--
-- Cette migration ne change aucune donnée : elle ajoute une colonne à la ligne de retour de
-- `mon_compte()`. Elle doit rester identique à la fonction d'origine (0077) à un champ près —
-- d'où la reprise intégrale du corps plutôt qu'un patch partiel.

-- 1. `mon_compte()` : une colonne de plus, la même fonction par ailleurs.
drop function if exists public.mon_compte();

create function public.mon_compte()
returns table (
  plan text,
  quota_mensuel int,
  questions int,
  imports int,
  jetons_consommes bigint,
  credits_jetons bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  recherches_web int,
  appels int,
  detail jsonb,
  mois date,
  abonnement_statut text,
  abonnement_fin timestamptz,
  abonnement_prix_centimes int,
  essai_fin timestamptz,
  est_test boolean,
  acces_gratuit boolean,
  acces_ferme_le timestamptz,
  abonnement_frequence text,
  abonnement_annule boolean
)
language sql
security invoker
set search_path = ''
as $$
  with profil as (
    select p.plan, p.quota_mensuel, p.abonnement_statut, p.abonnement_fin,
           p.abonnement_prix_centimes, p.essai_fin, p.est_test, p.acces_gratuit,
           p.acces_ferme_le, p.abonnement_frequence, p.abonnement_annule
      from public.assistant_profil p where p.user_id = auth.uid()
  ),
  mois_courant as (
    select date_trunc('month', now() at time zone 'Europe/Brussels')::date as mois
  )
  select
    coalesce((select pr.plan from profil pr), 'essai'),
    (select pr.quota_mensuel from profil pr),
    coalesce(q.questions, 0),
    coalesce(q.imports, 0),
    coalesce(q.jetons, 0),
    public.mes_credits_jetons(),
    coalesce(u.input_tokens, 0),
    coalesce(u.output_tokens, 0),
    coalesce(u.cache_read_tokens, 0),
    coalesce(u.cache_write_tokens, 0),
    coalesce(u.recherches_web, 0),
    coalesce(u.appels, 0),
    coalesce(d.detail, '[]'::jsonb),
    m.mois,
    coalesce((select pr.abonnement_statut from profil pr), 'aucun'),
    (select pr.abonnement_fin from profil pr),
    (select pr.abonnement_prix_centimes from profil pr),
    (select pr.essai_fin from profil pr),
    coalesce((select pr.est_test from profil pr), false),
    coalesce((select pr.acces_gratuit from profil pr), false),
    (select pr.acces_ferme_le from profil pr),
    (select pr.abonnement_frequence from profil pr),
    -- `coalesce` : une base qui n'aurait pas encore la colonne doit répondre `false`, jamais `null`
    -- — un écran qui reçoit `null` se tait, et c'est déjà ce qu'il fait pour une colonne absente.
    coalesce((select pr.abonnement_annule from profil pr), false)
  from mois_courant m
  left join public.quotas_mensuels q on q.user_id = auth.uid() and q.mois = m.mois
  left join (
    select sum(input_tokens)::bigint as input_tokens,
           sum(output_tokens)::bigint as output_tokens,
           sum(cache_read_tokens)::bigint as cache_read_tokens,
           sum(cache_write_tokens)::bigint as cache_write_tokens,
           sum(recherches_web)::int as recherches_web,
           sum(appels)::int as appels
      from public.usage_llm
     where user_id = auth.uid()
       and date_trunc('month', created_at at time zone 'Europe/Brussels')::date = (select mois from mois_courant)
  ) u on true
  left join (
    select jsonb_agg(
             jsonb_build_object(
               'fonction', v.fonction,
               'appels', v.appels,
               'input_tokens', v.input_tokens,
               'output_tokens', v.output_tokens,
               'cache_read_tokens', v.cache_read_tokens,
               'cache_write_tokens', v.cache_write_tokens,
               'recherches_web', v.recherches_web
             ) order by v.appels desc, v.fonction
           ) as detail
      from public.usage_mensuel v
     where v.user_id = auth.uid()
       and v.mois = (select mois from mois_courant)
  ) d on true
$$;

-- `drop function` emporte les droits : sans ce grant, l'écran d'abonnement répondrait
-- « permission denied » à tous les comptes. Recopié de la 0077 — c'est la même fonction.
grant execute on function public.mon_compte() to authenticated, service_role;
