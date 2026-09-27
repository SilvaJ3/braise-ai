-- 0069 — Le plafond du mois passe des questions aux jetons, et les packs s'achètent.
--
-- Pourquoi ce déplacement. Le plafond comptait des « questions » : un tour de chat enchaîne
-- plusieurs appels au modèle, et un import de fichier sort jusqu'à 16 000 jetons. Deux unités du
-- même compteur valaient donc des choses très différentes, et rien ne bornait réellement la
-- facture du fournisseur. Le compteur du mois compte désormais des JETONS ÉQUIVALENTS ENTRÉE —
-- la règle vit dans `_shared/enveloppe.ts`, dérivée du tarif par million de jetons, jamais écrite
-- en dur ici. Et ce qui dépasse l'enveloppe s'achète : des packs de jetons, payés une fois.
--
-- Rien n'est recalculé sur l'existant : les questions déjà comptées restent stockées et lisibles
-- (l'écran s'en sert tant que la migration n'est pas partout), et le compteur de jetons part de
-- zéro. Une seule chose a changé de sens : ce qui est vendu.

-- 1. Le compteur du mois porte les jetons, à côté des deux anciens compteurs.
--    Une colonne plutôt qu'une table parallèle : c'est le même mois, le même compte, et deux
--    tables finiraient par se contredire.
alter table public.quotas_mensuels
  add column if not exists jetons bigint not null default 0 check (jetons >= 0);

-- 2. Les crédits achetés — append-only, et hors de portée du client.
--    `session_stripe` est UNIQUE : c'est cette contrainte qui rend le crédit idempotent. Un
--    événement rejoué par Stripe retombe sur la même ligne et ne crédite pas deux fois.
--    La contrainte de source porte les deux packs et `geste` (un dédommagement à la main, qui
--    s'écrit comme une ligne de crédit plutôt que par une colonne de dérogation de plus).
create table if not exists public.credits_jetons (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  jetons bigint not null check (jetons > 0),
  source text not null check (source in ('pack_30', 'pack_50', 'geste')),
  session_stripe text unique,
  created_at timestamptz not null default now()
);

alter table public.credits_jetons enable row level security;

-- RLS activée et AUCUNE policy, volontairement. Un plafond compté sur des lignes que le client
-- peut écrire ne borne rien : si le compte pouvait insérer ici, il s'achèterait des jetons tout
-- seul. Seul le service_role (les edge functions) écrit et lit cette table ; le compte voit son
-- solde par `mes_credits_jetons()`.
create index if not exists credits_jetons_user_idx on public.credits_jetons (user_id, created_at desc);

-- 3. Réserver, puis corriger.
--    Sur le modèle de `consommer_quota_mois` : upsert atomique, jamais lire-puis-écrire, sinon
--    deux tours simultanés passeraient tous les deux sous le plafond.
create or replace function public.consommer_jetons_mois(p_user uuid, p_jetons bigint, p_max bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mois date := date_trunc('month', now() at time zone 'Europe/Brussels')::date;
  v_total bigint;
begin
  if p_jetons is null or p_jetons < 0 then
    raise exception 'jetons à réserver invalides : %', p_jetons using errcode = 'invalid_parameter_value';
  end if;
  if p_max is null or p_max < 0 then
    raise exception 'plafond invalide : %', p_max using errcode = 'invalid_parameter_value';
  end if;

  insert into public.quotas_mensuels (user_id, mois, jetons)
  values (p_user, v_mois, p_jetons)
  on conflict (user_id, mois) do update
    set jetons = public.quotas_mensuels.jetons + p_jetons
  returning jetons into v_total;

  -- Le plafond est vérifié APRÈS l'incrément, et l'appelant n'appelle le modèle que si c'est vrai :
  -- on réserve puis on compare, jamais l'inverse.
  return v_total <= p_max;
end $$;

revoke all on function public.consommer_jetons_mois(uuid, bigint, bigint) from public, anon, authenticated;

-- La réservation d'avant l'appel n'est qu'un à-valoir : la consommation réelle la remplace juste
-- après. Le plancher à zéro évite qu'une correction négative (un tour moins cher que prévu, ou un
-- échec) fasse repartir le compteur en arrière.
create or replace function public.corriger_jetons_mois(p_user uuid, p_delta bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mois date := date_trunc('month', now() at time zone 'Europe/Brussels')::date;
  v_total bigint;
begin
  if p_delta is null then
    raise exception 'correction absente' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.quotas_mensuels (user_id, mois, jetons)
  values (p_user, v_mois, greatest(0, p_delta))
  on conflict (user_id, mois) do update
    set jetons = greatest(0, public.quotas_mensuels.jetons + p_delta)
  returning jetons into v_total;

  return v_total;
end $$;

revoke all on function public.corriger_jetons_mois(uuid, bigint) from public, anon, authenticated;

-- 4. Créditer un achat.
--    Idempotent par construction : la seconde insertion du même achat ne trouve pas de ligne à
--    créer. Le code appelant n'a donc pas besoin de relire avant d'écrire — et le resterait même
--    sous deux livraisons simultanées du même événement.
create or replace function public.crediter_pack(p_user uuid, p_jetons bigint, p_source text, p_session text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_jetons is null or p_jetons <= 0 then
    raise exception 'jetons invalides : %', p_jetons using errcode = 'invalid_parameter_value';
  end if;
  if p_source is null or p_source not in ('pack_30', 'pack_50', 'geste') then
    raise exception 'source inconnue : %', p_source using errcode = 'invalid_parameter_value';
  end if;
  if p_session is null or btrim(p_session) = '' then
    raise exception 'session Stripe absente' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.credits_jetons (user_id, jetons, source, session_stripe)
  values (p_user, p_jetons, p_source, btrim(p_session))
  on conflict (session_stripe) do nothing
  returning id into v_id;

  -- vrai = le compte vient d'être crédité ; faux = cet achat était déjà passé.
  return v_id is not null;
end $$;

revoke all on function public.crediter_pack(uuid, bigint, text, text) from public, anon, authenticated;

-- 5. Le solde de crédits, exposé au compte sans ouvrir la table.
--    `security definer` : c'est la fonction qui décide, et elle ne rend que le solde du compte
--    appelant. Un pack ne périme pas — le solde est la somme des lignes, rien d'autre.
create or replace function public.mes_credits_jetons()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select coalesce(sum(jetons), 0)::bigint
    from public.credits_jetons
   where user_id = auth.uid()
$$;

revoke all on function public.mes_credits_jetons() from public, anon;
grant execute on function public.mes_credits_jetons() to authenticated;

-- 6. `mon_compte()` recréé : le type de retour change, donc `create or replace` ne suffit pas.
--    Le front lit le résultat PAR NOM : une version plus ancienne de l'app restée ouverte dans un
--    onglet ne casse pas. Deux chiffres s'ajoutent — les jetons du mois et les crédits restants —
--    et l'écran applique `enveloppeJetons(plan)` pour savoir à quoi il a droit, comme il appliquait
--    `quotaQuestions(plan)` avant.
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
