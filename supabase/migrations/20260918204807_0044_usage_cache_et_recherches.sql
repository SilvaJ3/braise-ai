-- 0044 — Journal plus fin : cache de prompt et recherches web.
--
-- Le journal ne comptait que les jetons d'entrée et de sortie. Or, chez Anthropic, les jetons relus
-- dans le cache sont facturés 0,1x le tarif d'entrée et ceux écrits 1,25x, et une recherche de
-- l'outil web serveur est facturée à la pièce (10 $ / 1000) sans apparaître dans aucun compteur de
-- jetons. Sans ces colonnes, le coût affiché était faux dans les deux sens : gonflé sur la partie
-- relue, et muet sur ce que le cache fait réellement gagner.

alter table public.usage_llm
  add column cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  add column cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  add column recherches_web int not null default 0 check (recherches_web >= 0);

-- L'agrégat par fonction gagne les mêmes mesures : c'est là qu'on lit « quel usage, quelle
-- quantité » (chat, bilan, import), plutôt qu'un total unique qui ne dit rien de la répartition.
create or replace view public.usage_mensuel with (security_invoker = true) as
  select
    user_id,
    date_trunc('month', created_at at time zone 'Europe/Brussels')::date as mois,
    fonction,
    sum(appels)::int as appels,
    sum(input_tokens)::bigint as input_tokens,
    sum(output_tokens)::bigint as output_tokens,
    sum(cache_read_tokens)::bigint as cache_read_tokens,
    sum(cache_write_tokens)::bigint as cache_write_tokens,
    sum(recherches_web)::int as recherches_web
  from public.usage_llm
  group by 1, 2, 3;

-- `mon_compte()` change de forme (colonnes en plus) : un `create or replace` ne peut pas modifier
-- un type de retour, il faut recréer. Le front lit le résultat par nom, donc les colonnes ajoutées
-- ne cassent pas l'ancienne version de l'app pendant la bascule.
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
  mois date
)
language sql
security invoker
set search_path = ''
as $$
  with profil as (
    select p.plan, p.quota_mensuel from public.assistant_profil p where p.user_id = auth.uid()
  ),
  mois_courant as (
    select date_trunc('month', now() at time zone 'Europe/Brussels')::date as mois
  )
  select
    coalesce((select plan from profil), 'essai'),
    (select quota_mensuel from profil),
    coalesce(q.questions, 0),
    coalesce(q.imports, 0),
    coalesce(u.input_tokens, 0),
    coalesce(u.output_tokens, 0),
    coalesce(u.cache_read_tokens, 0),
    coalesce(u.cache_write_tokens, 0),
    coalesce(u.recherches_web, 0),
    coalesce(u.appels, 0),
    coalesce(d.detail, '[]'::jsonb),
    m.mois
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
