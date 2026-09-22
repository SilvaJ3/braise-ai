-- 0041 — Plan, quota mensuel et journalisation des tokens.
--
-- Jusqu'ici le coût LLM n'était borné que par des garde-fous horaires (40 questions/heure) : rien
-- ne plafonnait ce qu'un compte pouvait consommer dans le mois, et la facture ne se voyait qu'en
-- fin de mois chez Anthropic. On ajoute donc ce qui manque pour vendre : un plan par compte, un
-- quota mensuel qui s'applique côté serveur, et un journal des tokens réellement consommés.

alter table public.assistant_profil
  add column if not exists plan text not null default 'essai',
  add column if not exists plan_depuis timestamptz,
  -- Dérogation ponctuelle (dépannage, geste commercial) : null = le quota du plan, qui vit dans
  -- `_shared/compte.ts` côté code. Une seule source de vérité par défaut.
  add column if not exists quota_mensuel int;

alter table public.assistant_profil
  add constraint assistant_profil_plan_valide check (plan in ('essai', 'fondateur', 'mensuel', 'annuel')),
  add constraint assistant_profil_quota_plausible
    check (quota_mensuel is null or quota_mensuel between 1 and 100000);

-- Les comptes ouverts avant la commercialisation ne sont pas des essais : ils ont servi à
-- construire l'outil. Alexandra et le compte de test passent en fondateur, sans quota serré.
update public.assistant_profil
   set plan = 'fondateur', plan_depuis = now()
 where plan = 'essai';

-- Compteurs du mois calendaire (Europe/Bruxelles, voir la fonction : le mois d'un artisan se
-- termine à minuit chez lui, pas à minuit UTC).
create table public.quotas_mensuels (
  user_id uuid not null references auth.users(id) on delete cascade,
  mois date not null,
  questions int not null default 0 check (questions >= 0),
  imports int not null default 0 check (imports >= 0),
  primary key (user_id, mois)
);

alter table public.quotas_mensuels enable row level security;

-- Le compte peut LIRE sa consommation (elle s'affiche dans Compte), jamais l'écrire : c'est une
-- fonction service_role qui incrémente, sinon le quota se remettrait à zéro tout seul.
create policy "quotas_mensuels: own rows" on public.quotas_mensuels
  for select to authenticated using (user_id = (select auth.uid()));

-- Consomme une unité et dit si l'appel est autorisé. Upsert atomique : deux questions simultanées
-- ne peuvent pas lire le même compteur (leçon des quotas contournables de l'audit).
create or replace function public.consommer_quota_mois(p_user uuid, p_quoi text, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mois date := date_trunc('month', now() at time zone 'Europe/Brussels')::date;
  v_compte int;
begin
  if p_quoi not in ('questions', 'imports') then
    raise exception 'compteur inconnu : %', p_quoi using errcode = 'invalid_parameter_value';
  end if;

  insert into public.quotas_mensuels (user_id, mois, questions, imports)
  values (
    p_user,
    v_mois,
    case when p_quoi = 'questions' then 1 else 0 end,
    case when p_quoi = 'imports' then 1 else 0 end
  )
  on conflict (user_id, mois) do update
    set questions = public.quotas_mensuels.questions + case when p_quoi = 'questions' then 1 else 0 end,
        imports = public.quotas_mensuels.imports + case when p_quoi = 'imports' then 1 else 0 end
  returning case when p_quoi = 'questions' then questions else imports end into v_compte;

  return v_compte <= p_max;
end $$;

revoke all on function public.consommer_quota_mois(uuid, text, int) from public, anon, authenticated;

-- Journal des tokens consommés. Écrit uniquement par les edge functions (service_role) ; le
-- compte lit les siens, c'est ce qui rend la facture visible avant la fin du mois.
create table public.usage_llm (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  fonction text not null check (fonction in ('assistant', 'bilan', 'import', 'autre')),
  modele text check (modele is null or char_length(modele) <= 60),
  appels int not null default 1 check (appels >= 1),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

alter table public.usage_llm enable row level security;

create policy "usage_llm: own rows" on public.usage_llm
  for select to authenticated using (user_id = (select auth.uid()));

create index usage_llm_user_idx on public.usage_llm (user_id, created_at desc);

-- Agrégat mensuel par fonction, pour l'écran Compte. `security_invoker` fait appliquer la RLS de
-- `usage_llm` : chacun ne voit que son propre usage.
create view public.usage_mensuel with (security_invoker = true) as
  select
    user_id,
    date_trunc('month', created_at at time zone 'Europe/Brussels')::date as mois,
    fonction,
    sum(appels)::int as appels,
    sum(input_tokens)::bigint as input_tokens,
    sum(output_tokens)::bigint as output_tokens
  from public.usage_llm
  group by 1, 2, 3;

-- Tout ce que l'écran Compte doit afficher, en un appel, sous la RLS du compte appelant.
-- Le quota effectif n'est pas calculé ici : il dépend du plan, dont la table de référence vit
-- dans `_shared/compte.ts` (une seule source de vérité). On renvoie la dérogation éventuelle, et
-- le front applique `quotaQuestions(plan, derogation)`.
create or replace function public.mon_compte()
returns table (
  plan text,
  quota_derogation int,
  questions_utilisees int,
  imports_utilises int,
  input_tokens bigint,
  output_tokens bigint,
  appels int,
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
    coalesce(u.appels, 0),
    m.mois
  from mois_courant m
  left join public.quotas_mensuels q on q.user_id = auth.uid() and q.mois = m.mois
  left join (
    select sum(input_tokens)::bigint as input_tokens,
           sum(output_tokens)::bigint as output_tokens,
           sum(appels)::int as appels
      from public.usage_llm
     where user_id = auth.uid()
       and date_trunc('month', created_at at time zone 'Europe/Brussels')::date = (select mois from mois_courant)
  ) u on true;
$$;

grant execute on function public.mon_compte() to authenticated;
