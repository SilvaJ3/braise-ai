-- 0075 — L'essai de sept jours, la porte qui se ferme après, et les colonnes du compte
--         rendues à qui elles appartiennent.
--
-- Le produit a une règle simple : sept jours pour juger l'outil, puis l'abonnement. Jusqu'ici un
-- compte restait en plan `essai` indéfiniment, avec un petit forfait : « essayer » n'avait pas de
-- fin, et rien ne menait au paiement.
--
-- `essai_fin` dit quand le compte cesse d'avoir accès. C'est une colonne à part plutôt qu'un calcul
-- sur la date de création du compte : un essai doit pouvoir s'ALLONGER pour un compte précis
-- (geste commercial, dépannage) sans réécrire l'histoire du compte. La date de création, elle, vit
-- dans `auth.users` et ne se touche pas.
--
-- Ce que la colonne ne porte pas : le début de l'essai. Il commence à l'ouverture du compte, et
-- personne n'a besoin de le relire pour décider quoi que ce soit.

alter table public.assistant_profil
  add column if not exists essai_fin timestamptz;

-- Les comptes ouverts avant cette règle n'ont rien consommé : ils reçoivent les sept jours à partir
-- d'ici, plutôt que d'être coupés le jour de la mise en service. Un essai déjà réglé n'est pas
-- retouché.
update public.assistant_profil
   set essai_fin = now() + interval '7 days'
 where essai_fin is null;

alter table public.assistant_profil
  alter column essai_fin set default (now() + interval '7 days');

alter table public.assistant_profil
  alter column essai_fin set not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Les colonnes du compte : ce que le client a le droit d'écrire, et ce qu'il n'écrit pas.
--
-- Constaté le 01/10/2026 en posant la porte de l'essai : `anon` et `authenticated` portaient
-- `arwdDxtm` — TOUS les droits, à la table — sur `assistant_profil`, et la policy « own row »
-- laisse chacun écrire SA ligne. Un compte pouvait donc s'écrire `abonnement_statut = 'actif'`,
-- `plan = 'mensuel'`, `est_test = true` ou `essai_fin = 2099` par un simple appel PostgREST, et
-- la porte de l'essai n'aurait rien fermé du tout. Ce n'est pas une hypothèse : c'est ce que
-- permettaient les droits, avant cette migration.
--
-- Le partage est net : les champs de PROFIL s'écrivent depuis l'app (le tunnel, l'écran
-- d'informations, la fermeture de la carte de démarrage) ; tout ce qui décide du DROIT ou du
-- montant s'écrit côté serveur, avec la clé de service — invitation, webhook Stripe, geste
-- commercial. `service_role` n'est pas touché ici : il contourne la RLS et c'est lui qui écrit.
--
-- Le `revoke` de table est indispensable même après un `grant` par colonnes : un droit de table
-- couvre toutes les colonnes, y compris celles ajoutées plus tard, et un `revoke` par colonne ne
-- le retire pas.

revoke insert, update, delete, truncate, references, trigger
  on public.assistant_profil from anon, authenticated;

-- Ce que l'application écrit réellement — et rien d'autre. `updated_at` accompagne chaque écriture.
grant insert (
  user_id, metier, nom_commercial, ville, pays, canaux, plateformes, contenu, message_accueil,
  onboarding_completed_at, demarrage_ferme_at, conditions_acceptees_le, updated_at
) on public.assistant_profil to authenticated;

grant update (
  metier, nom_commercial, ville, pays, canaux, plateformes, contenu, message_accueil,
  onboarding_completed_at, demarrage_ferme_at, conditions_acceptees_le, updated_at
) on public.assistant_profil to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- L'écran d'abonnement doit pouvoir dire où en est l'essai sans lire la table en direct : depuis
-- 0064, tout ce que l'écran affiche passe par `mon_compte()` sous la RLS du compte appelant.
-- Même contrainte qu'en 0064 : `create or replace` ne change pas un type de retour, donc on recrée,
-- et le front lit le résultat PAR NOM — une colonne ajoutée ne casse pas un onglet resté ouvert.
--
-- `est_test` sort avec, et ce n'est pas un ornement : les écrans décident avec la même règle que le
-- serveur (`accesAutorise`), et sans ce drapeau l'écran d'un compte de test annoncerait « essai
-- terminé » pendant que le serveur répond — deux vérités pour un même compte.
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
  est_test boolean
)
language sql
security invoker
set search_path = ''
as $$
  with profil as (
    select p.plan, p.quota_mensuel, p.abonnement_statut, p.abonnement_fin,
           p.abonnement_prix_centimes, p.essai_fin, p.est_test
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
    coalesce((select pr.est_test from profil pr), false)
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

-- `drop function` emporte les droits : sans cette ligne, l'écran d'abonnement répondrait
-- « permission denied » à tous les comptes.
grant execute on function public.mon_compte() to authenticated, service_role;
