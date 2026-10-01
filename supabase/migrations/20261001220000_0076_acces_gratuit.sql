-- 0076 — Qui utilise Braaise gratuitement : un choix de l'administrateur, pas un effet de bord.
--
-- L'essai de sept jours (0075) ferme l'assistant et les imports à qui ne paie pas. Il manquait la
-- porte de service : un artisan à qui l'on offre l'outil — la première boutique, un proche, un
-- dépannage, un partenariat — doit pouvoir s'en servir sans qu'on lui fabrique un abonnement
-- Stripe à zéro euro, et sans que son écran lui annonce un essai terminé.
--
-- `acces_gratuit` est donc une décision explicite, colonne par colonne, compte par compte. Elle ne
-- se déduit de rien : ni d'un plan, ni d'une date, ni d'un montant. C'est ce qui la rend lisible —
-- on peut montrer la liste de ceux à qui l'outil est offert.
--
-- L'écriture est réservée à l'administration : les fonctions ci-dessous sont `security definer` et
-- refusent tout appelant qui n'est pas dans `admin_comptes` (0065). Le client, lui, n'a aucun droit
-- d'écriture sur ces deux colonnes (0075 : les droits sont donnés colonne par colonne).

alter table public.assistant_profil
  add column if not exists acces_gratuit boolean not null default false,
  -- Depuis quand, et c'est la seule trace du geste : une ligne qui s'explique toute seule dans six
  -- mois vaut mieux qu'un booléen nu.
  add column if not exists acces_gratuit_depuis timestamptz;

-- Les comptes d'administration gardent l'accès, posé ici une fois et visible comme n'importe quel
-- autre accès offert (dans la liste, retirable d'un clic). Ils ne sont pas des clients, et celui
-- qui ouvre l'accès aux autres ne doit pas se le fermer à lui-même en oubliant sa propre case.
--
-- La ligne de profil est créée au besoin : un compte d'administration qui n'a pas rempli le tunnel
-- d'accueil n'a pas de ligne, et l'application l'y renvoie — or administrer ne demande pas de
-- déclarer son métier. Le tunnel est marqué terminé pour ces comptes-là, et pour eux seuls.
insert into public.assistant_profil (user_id, plan, acces_gratuit, acces_gratuit_depuis, onboarding_completed_at)
select a.user_id, 'essai', true, now(), now()
  from public.admin_comptes a
    on conflict (user_id) do update
      set acces_gratuit = true,
          acces_gratuit_depuis = coalesce(public.assistant_profil.acces_gratuit_depuis, now()),
          onboarding_completed_at = coalesce(public.assistant_profil.onboarding_completed_at, now());

-- L'écran d'administration : la liste des comptes, avec ce qui décide de leur accès. Bornée dans la
-- fonction, comme `demandes_acces_admin` (0065) — un écran ne demande pas la table entière.
create or replace function public.comptes_admin(p_limite integer default 100)
returns table (
  user_id uuid,
  email text,
  plan text,
  abonnement_statut text,
  essai_fin timestamptz,
  acces_gratuit boolean,
  acces_gratuit_depuis timestamptz,
  est_test boolean,
  ouvert_le timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
begin
  if not public.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  return query
    select p.user_id, u.email::text, p.plan, p.abonnement_statut, p.essai_fin,
           p.acces_gratuit, p.acces_gratuit_depuis, p.est_test, u.created_at
      from public.assistant_profil p
      join auth.users u on u.id = p.user_id
     order by u.created_at desc
     limit v_limite;
end;
$$;

-- Ouvrir ou fermer l'accès offert. La date suit le drapeau : on ne garde pas la trace d'un accès
-- offert qui n'existe plus, et on ne remet pas la date à maintenant quand rien ne change (c'est la
-- différence entre « offert depuis le 1er octobre » et « on a cliqué deux fois »).
create or replace function public.regler_acces_gratuit(p_user uuid, p_gratuit boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  update public.assistant_profil
     set acces_gratuit = coalesce(p_gratuit, false),
         acces_gratuit_depuis = case
           when coalesce(p_gratuit, false) then coalesce(acces_gratuit_depuis, now())
           else null
         end,
         updated_at = now()
   where user_id = p_user;

  if not found then
    raise exception 'compte inconnu' using errcode = '22023';
  end if;

  return coalesce(p_gratuit, false);
end;
$$;

revoke all on function public.comptes_admin(integer) from public, anon;
revoke all on function public.regler_acces_gratuit(uuid, boolean) from public, anon;
grant execute on function public.comptes_admin(integer) to authenticated;
grant execute on function public.regler_acces_gratuit(uuid, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- L'écran de l'artisan doit lire l'accès offert comme le serveur le juge : sans cette colonne,
-- un compte à qui l'outil est offert lirait « Tes 7 jours d'essai sont terminés » alors qu'il a
-- accès. Même contrainte qu'en 0064 et 0075 : `create or replace` ne change pas un type de retour,
-- donc on recrée, et le front lit le résultat par nom.
drop function if exists public.mon_compte();

create function public.mon_compte()
returns table (
  plan text,
  quota_derogation int,
  questions_utilisees int,
  imports_utilises int,
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
  acces_gratuit boolean
)
language sql
security invoker
set search_path = ''
as $$
  with profil as (
    select p.plan, p.quota_mensuel, p.abonnement_statut, p.abonnement_fin,
           p.abonnement_prix_centimes, p.essai_fin, p.est_test, p.acces_gratuit
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
    coalesce((select pr.acces_gratuit from profil pr), false)
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

grant execute on function public.mon_compte() to authenticated, service_role;
