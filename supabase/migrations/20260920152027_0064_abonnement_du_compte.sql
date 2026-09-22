-- 0064 — L'écran d'abonnement lit ce que la base sait déjà.
--
-- Jusqu'ici `mon_compte()` ne renvoyait que la consommation. Le statut de paiement, la fin de
-- période et le montant réellement prélevé vivent dans `assistant_profil` depuis 0049, mais
-- n'étaient exposés à rien : l'app ne peut pas les lire par un select colonne par colonne sans
-- contredire la règle du compte (« ce qui s'affiche vient de la base, sous la RLS du compte
-- appelant »). Ils passent donc par la même fonction que le reste de l'écran.
--
-- Comme en 0044 : `create or replace` ne peut pas changer un type de retour, donc on recrée. Le
-- front lit le résultat **par nom** — les colonnes ajoutées ne cassent pas une version plus
-- ancienne de l'app restée ouverte dans un onglet pendant le déploiement.
--
-- Rien n'est dupliqué depuis Stripe : ces trois colonnes sont écrites par `stripe-webhook` et
-- restent des raccourcis d'affichage. Le montant de `abonnement_prix_centimes` est celui que le
-- compte paie réellement, remise fondateur déduite — c'est lui qui permet de voir qu'un coupon a
-- expiré.

drop function if exists public.mon_compte();

create function public.mon_compte()
returns table (
  plan text,
  quota_derogation int,
  questions_utilisees int,
  imports_utilises int,
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
  abonnement_prix_centimes int
)
language sql
security invoker
set search_path = ''
as $$
  with profil as (
    select p.plan, p.quota_mensuel, p.abonnement_statut, p.abonnement_fin,
           p.abonnement_prix_centimes
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
    (select pr.abonnement_prix_centimes from profil pr)
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
  ) d on true;
$$;

grant execute on function public.mon_compte() to authenticated;
