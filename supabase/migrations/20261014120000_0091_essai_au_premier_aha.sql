-- 0091 — L'essai de sept jours s'ouvre à la première vraie action, sans carte.
--
-- Décision de JSB (14/10/2026), qui remplace celle du 02/10 (0077, « l'essai s'ouvre avec la
-- carte »). Constat : avec 0077, un compte neuf n'avait RIEN — l'import de produits, l'assistant et
-- le premier bon étaient refusés tant que la carte n'était pas donnée, c'est-à-dire avant d'avoir
-- vu à quoi l'outil sert. Le tunnel d'accueil proposait « Charger mon catalogue » à quelqu'un dont
-- l'import allait être refusé.
--
-- La règle devient : le compte neuf travaille tout de suite, et les sept jours commencent à la
-- première action qui montre la valeur. Quatre événements comptent, un par façon d'utiliser l'app :
--   · un produit enregistré (import ou saisie)          → table `produits`
--   · un bon de dépôt créé                              → table `depots`
--   · un post validé (planifié) ou publié               → table `content_entries`
--   · un message écrit à l'assistant                    → table `chat_messages`
-- Le premier atteint ouvre l'essai ; les suivants ne changent rien.
--
-- `essai_fin` null = l'essai n'a pas commencé. `accesAutorise` laisse déjà passer une date absente
-- (`_shared/essai.ts`) : c'est exactement l'état voulu pour un compte qui doit pouvoir travailler
-- pour atteindre son premier aha.
--
-- Les sept jours ci-dessous doivent rester égaux à `ESSAI_JOURS` (`_shared/essai.ts`) : un test
-- (`essai-migration.test.ts`) le vérifie.

alter table public.assistant_profil
  alter column essai_fin drop not null,
  alter column essai_fin set default null;

-- Les comptes qui n'ont jamais eu d'abonnement Stripe n'ont jamais eu d'essai : leur `essai_fin`
-- est le défaut de 0077 (= la date de création), pas une vraie date d'essai. Ils reviennent à
-- « pas commencé ». Ne sont PAS touchés : un compte qui a (eu) un abonnement, un essai encore en
-- cours (0075), et une fermeture décidée après relances (`acces_ferme_le`, qui passe avant tout).
update public.assistant_profil
   set essai_fin = null
 where stripe_subscription_id is null
   and coalesce(abonnement_statut, 'aucun') = 'aucun'
   and acces_ferme_le is null
   and essai_fin is not null
   and essai_fin <= now();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Le déclencheur. `security definer` : l'app n'a pas le droit d'écrire `essai_fin` (0075) — c'est le
-- serveur qui l'ouvre, jamais le navigateur. La garde `essai_fin is null` fait que l'essai ne
-- s'ouvre qu'une fois et qu'un import de 500 produits ne coûte que des mises à jour à vide.
create or replace function public.ouvrir_essai_au_premier_aha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assistant_profil
     set essai_fin = now() + interval '7 days'
   where user_id = new.user_id
     and essai_fin is null;
  return new;
end;
$$;

revoke execute on function public.ouvrir_essai_au_premier_aha() from public, anon, authenticated;

create trigger essai_au_premier_produit
  after insert on public.produits
  for each row execute function public.ouvrir_essai_au_premier_aha();

create trigger essai_au_premier_bon
  after insert on public.depots
  for each row execute function public.ouvrir_essai_au_premier_aha();

-- Une idée de planning n'est pas un aha : un post VALIDÉ (planifié) ou PUBLIÉ l'est.
create trigger essai_au_premier_post
  after insert or update of status on public.content_entries
  for each row
  when (new.status in ('planifie', 'publie'))
  execute function public.ouvrir_essai_au_premier_aha();

-- Seul le message de la personne compte : la réponse de l'assistant est écrite par le serveur.
create trigger essai_au_premier_message
  after insert on public.chat_messages
  for each row
  when (new.role = 'user')
  execute function public.ouvrir_essai_au_premier_aha();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Le borne : l'essai ne reste pas « pas commencé » indéfiniment.
--
-- Décision de JSB (14/10/2026) : un compte qui n'atteint jamais un aha ne doit pas garder un
-- accès libre sans limite. Sept jours après l'ouverture du compte, l'essai s'ouvre d'office, pour
-- sept jours. Au plus : sept jours pour se lancer + sept jours d'essai = quatorze jours depuis
-- l'inscription. Ces deux « 7 » sont `ESSAI_JOURS` et `ESSAI_OUVERT_D_OFFICE_APRES_JOURS`
-- (`_shared/essai.ts`) ; `essai-migration.test.ts` le vérifie.
--
-- Passage quotidien par pg_cron (comme les rappels) : l'ouverture d'office a donc jusqu'à un jour de
-- retard, ce qui est sans conséquence ici. Sont exclus les comptes qui n'ont pas d'essai à ouvrir :
-- abonnés (ou ayant déjà eu un abonnement), accès offert, comptes de test et de démonstration.
create or replace function public.ouvrir_essais_d_office()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ouverts integer;
begin
  update public.assistant_profil p
     set essai_fin = now() + interval '7 days',
         updated_at = now()
    from auth.users u
   where u.id = p.user_id
     and p.essai_fin is null
     and u.created_at <= now() - interval '7 days'
     and p.stripe_subscription_id is null
     and coalesce(p.abonnement_statut, 'aucun') = 'aucun'
     and not p.acces_gratuit
     and not p.est_test
     and not p.demo;
  get diagnostics v_ouverts = row_count;
  return v_ouverts;
end;
$$;

revoke execute on function public.ouvrir_essais_d_office() from public, anon, authenticated;

select cron.schedule(
  'essai-ouverture-d-office',
  '20 7 * * *',
  $$ select public.ouvrir_essais_d_office(); $$
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Redonner des jours, au cas par cas. Réservé à l'administration, comme `regler_acces_gratuit`
-- (0076) : le client n'a aucun droit d'écriture sur `essai_fin`.
--
-- Les jours s'ajoutent à partir de la fin de l'essai si elle est devant nous, sinon à partir de
-- maintenant : un essai fini ne « ressuscite » pas dans le passé. Les rappels de fin d'essai sont
-- remis à zéro pour repartir avec la nouvelle date. Bornée de 1 à 60 jours : une faute de frappe ne
-- doit pas offrir un an. Rend la nouvelle date de fin.
create or replace function public.prolonger_essai(p_user uuid, p_jours integer)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fin timestamptz;
begin
  if not public.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;
  if p_jours is null or p_jours < 1 or p_jours > 60 then
    raise exception 'jours_invalides' using errcode = '22023';
  end if;

  update public.assistant_profil
     set essai_fin = greatest(coalesce(essai_fin, now()), now()) + make_interval(days => p_jours),
         essai_rappel_j2_le = null,
         essai_rappel_j1_le = null,
         updated_at = now()
   where user_id = p_user
  returning essai_fin into v_fin;

  if not found then
    raise exception 'compte inconnu' using errcode = '22023';
  end if;
  return v_fin;
end;
$$;

revoke all on function public.prolonger_essai(uuid, integer) from public, anon;
grant execute on function public.prolonger_essai(uuid, integer) to authenticated;
