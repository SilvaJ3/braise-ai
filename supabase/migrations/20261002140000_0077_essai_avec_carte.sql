-- 0077 — L'essai s'ouvre avec la carte, et la porte se ferme après trois relances.
--
-- Ce que cette migration change par rapport à 0075 : les sept jours d'essai ne s'ouvrent plus tout
-- seuls à l'ouverture du compte. Ils s'ouvrent quand la personne donne sa carte — Checkout Stripe,
-- `trial_period_days: 7` et `payment_method_collection: 'always'` — parce qu'un essai qui ne mène à
-- rien laisse l'artisan s'installer dans un outil qu'il ne paiera jamais, et qu'un outil où l'on
-- s'installe sans payer ne se vend pas.
--
-- `essai_fin` reste la SEULE colonne qui dit quand l'essai s'arrête, mais son défaut ne donne plus
-- sept jours : un compte neuf n'a rien avant d'avoir commencé son essai. La vraie date de fin vient
-- de Stripe (`subscription.trial_end`), écrite par le webhook — jamais recalculée ici.
--
-- L'accès offert et les comptes de test passent toujours (0076) : c'est le seul autre chemin.

alter table public.assistant_profil
  alter column essai_fin set default now();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Les rappels et la fermeture. Chaque envoi laisse sa trace dans une colonne : un cron qui rejoue
-- le même jour, ou qui rattrape après une panne, ne renvoie rien deux fois. Une colonne de date
-- vaut mieux qu'un journal d'envois, parce que la question posée est toujours « est-ce déjà parti ? »

alter table public.assistant_profil
  -- L'essai : prévenu deux jours avant, et la veille (demandé par JSB, 02/10).
  add column if not exists essai_rappel_j2_le timestamptz,
  add column if not exists essai_rappel_j1_le timestamptz,
  -- Le prélèvement refusé : trois relances, puis la porte se ferme (02/10). Le compte garde
  -- `abonnement_statut = 'en_retard'` — c'est Stripe qui dit vrai sur le paiement —, c'est
  -- `acces_ferme_le` qui dit la décision de l'application. Séparer les deux permet de rouvrir à la
  -- première facture payée sans mentir sur l'état du paiement.
  add column if not exists impaye_relances int not null default 0,
  add column if not exists impaye_relance_le timestamptz,
  add column if not exists acces_ferme_le timestamptz,
  -- L'abonnement s'arrête à la fin de la période : la personne a déjà dit non. C'est ce que le
  -- statut Stripe ne dit pas tout seul (un essai arrêté reste `trialing` jusqu'au bout), et sans
  -- cette colonne on annoncerait un prélèvement à quelqu'un qui vient de résilier.
  add column if not exists abonnement_annule boolean not null default false,
  -- L'abonnement annuel : c'est le seul à durée déterminée, donc le seul dont la reconduction doit
  -- être annoncée (art. VI.91 CDE et l'information préalable au plus tard 15 jours avant la date
  -- limite pour s'y opposer). La fréquence se lit chez Stripe, pas dans un montant.
  add column if not exists abonnement_frequence text,
  add column if not exists renouvellement_avis_le timestamptz,
  -- La renonciation au droit de rétractation, datée à la création de la session de paiement
  -- (art. VI.47 et s. CDE : sans elle, la personne qui paie au 8e jour peut encore se rétracter
  -- pendant quatorze jours à compter de la conclusion du contrat).
  add column if not exists retractation_renoncee_le timestamptz;

-- Le coupe-circuit des rappels d'abonnement, sur le modèle de `rappels_boutiques_actifs` (0074) :
-- le cron peut exister et répondre « je n'envoie rien ». Ouvert ici, parce que ces mails-là vont au
-- client de Braaise lui-même et sont ce qui évite de prélever quelqu'un sans l'avoir prévenu.
insert into public.reglages_produit (cle, valeur)
values ('rappels_abonnement_actifs', 'oui')
on conflict (cle) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- L'écran doit pouvoir dire POURQUOI la porte est fermée, avec la même règle que le serveur.
-- Même contrainte qu'en 0064 et 0075 : `create or replace` ne change pas un type de retour, donc on
-- recrée, et le front lit le résultat PAR NOM — une colonne ajoutée ne casse pas un onglet ouvert.
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
  acces_gratuit boolean,
  acces_ferme_le timestamptz,
  abonnement_frequence text
)
language sql
security invoker
set search_path = ''
as $$
  with profil as (
    select p.plan, p.quota_mensuel, p.abonnement_statut, p.abonnement_fin,
           p.abonnement_prix_centimes, p.essai_fin, p.est_test, p.acces_gratuit,
           p.acces_ferme_le, p.abonnement_frequence
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
    (select pr.abonnement_frequence from profil pr)
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Ce que le cron doit lire pour savoir qui rappeler. La sélection vit en SQL, comme les rappels
-- boutique : elle a besoin de l'adresse e-mail, qui vit dans `auth.users` et n'est lisible par
-- personne d'autre que le propriétaire du schéma. `security definer` + un droit accordé au SEUL
-- service_role : un compte ne peut pas énumérer les adresses des autres.
--
-- Les comptes de test et les accès offerts sortent du lot : on n'envoie pas « ton essai se termine »
-- à quelqu'un qui ne paiera jamais, et on ne réclame pas un paiement à un compte de démonstration.
create or replace function public.abonnements_a_rappeler()
returns table (
  user_id uuid,
  email text,
  essai_fin timestamptz,
  essai_rappel_j2_le timestamptz,
  essai_rappel_j1_le timestamptz,
  abonnement_statut text,
  abonnement_annule boolean,
  abonnement_frequence text,
  abonnement_fin timestamptz,
  abonnement_prix_centimes int,
  renouvellement_avis_le timestamptz,
  impaye_relances int,
  impaye_relance_le timestamptz,
  acces_ferme_le timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.user_id,
         u.email::text,
         p.essai_fin,
         p.essai_rappel_j2_le,
         p.essai_rappel_j1_le,
         p.abonnement_statut,
         p.abonnement_annule,
         p.abonnement_frequence,
         p.abonnement_fin,
         p.abonnement_prix_centimes,
         p.renouvellement_avis_le,
         p.impaye_relances,
         p.impaye_relance_le,
         p.acces_ferme_le
    from public.assistant_profil p
    join auth.users u on u.id = p.user_id
   where coalesce(p.est_test, false) = false
     and coalesce(p.acces_gratuit, false) = false
     and u.email is not null
$$;

revoke all on function public.abonnements_a_rappeler() from public, anon, authenticated;
grant execute on function public.abonnements_a_rappeler() to service_role;

-- Le cron des rappels : tous les jours à 07:15 UTC, comme les rappels boutique à 07:00. Les deux
-- fonctions sont distinctes parce qu'elles ne parlent pas aux mêmes personnes — mais elles
-- partagent le même secret d'appel (Vault) et la même vérification (`verify_cron_secret`).
-- L'adresse est celle du projet Supabase, écrite en clair comme dans 0003, 0007 et 0062 : ce n'est
-- PAS `app_url` (qui porte l'adresse de l'application, chez Vercel) — s'y tromper ferait appeler
-- Vercel à 07:15 tous les jours, sans que personne ne s'en aperçoive.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'abonnement-rappels') then
    perform cron.unschedule('abonnement-rappels');
  end if;
  perform cron.schedule(
    'abonnement-rappels',
    '15 7 * * *',
    $cron$
      select net.http_post(
        url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/abonnement-rappels',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'assistant_cron_secret')
        ),
        body := jsonb_build_object('mode', 'quotidien'),
        timeout_milliseconds := 60000
      );
    $cron$
  );
end
$$;
