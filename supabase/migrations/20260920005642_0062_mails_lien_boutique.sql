-- 0062 — Les mails du lien boutique : le lien dans le pied du bon, le rappel du 1er, la relance du 5.
--
-- Trois choses, et rien de plus :
--
--   1. `lien_boutique_assurer(user, boutique)` — la logique de `mon_lien_boutique`, extraite pour
--      que le BON puisse lui aussi retrouver le lien de la boutique : le mail du bon portera
--      désormais l'adresse que la boutique gardera. `mon_lien_boutique` continue de rendre le même
--      jsonb au même public (l'artisan) ; l'interne, lui, n'est appelable qu'en service_role —
--      sinon n'importe quel compte connecté pourrait fabriquer un lien pour la boutique d'un autre.
--
--   2. `rappels_boutiques_a_envoyer(type, mois, reserver)` — ce qu'il faut dire à une boutique, et
--      pour qui : l'état RÉEL (ce qu'elle a déclaré le mois dernier, ce qu'il lui reste d'après
--      nos comptes), jamais « un relevé est disponible ». En `reserver = true`, la fonction prend
--      les lignes au passage (insertion, puis bail de dix minutes) : deux exécutions qui se
--      chevauchent ne peuvent pas envoyer deux fois le même mail, et un envoi échoué redevient
--      éligible — le rappel n'est pas perdu définitivement (même leçon que 0034).
--
--   3. La table `boutique_rappels` : la preuve d'envoi, UNE par boutique, par mois et par type.
--      C'est elle qui tient la promesse « un seul mail par mois », pas la mémoire d'un cron.
--
-- Le cron est posé ici mais ARMÉ par un réglage (`rappels_boutiques_actifs`) : rien ne part tant
-- qu'il vaut autre chose que 'oui'. La fonction edge refuse d'envoyer, et le dit — un cron qui
-- existe et n'envoie rien est plus honnête qu'un envoi décidé à la place de l'utilisateur.

-- --- 1. Le lien d'une boutique, sans passer par auth.uid() -------------------------------------
-- Extrait de 0052 sans en changer une règle : l'identité de la boutique est son adresse mail, et à
-- défaut celle où ses bons sont partis. Les deux fonctions rendent exactement la même chose.
create or replace function public.lien_boutique_assurer(p_user uuid, p_boutique uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nom text;
  v_lien uuid;
  v_jeton text;
begin
  if p_user is null or p_boutique is null then
    return jsonb_build_object('erreur', 'parametre_manquant');
  end if;

  select lower(btrim(b.email)), b.nom into v_email, v_nom
    from public.boutiques b
   where b.id = p_boutique and b.user_id = p_user;

  if v_email is null or v_email = '' then
    -- À défaut d'adresse sur la fiche, on prend celle à laquelle ses bons sont partis : c'est la
    -- même boutique, et l'artisan n'a rien à ressaisir.
    select lower(btrim(coalesce(nullif(d.boutique_email, ''), d.email_to[1])))
      into v_email
      from public.depots d
     where d.user_id = p_user
       and d.boutique_id = p_boutique
       and (coalesce(d.boutique_email, '') <> '' or coalesce(array_length(d.email_to, 1), 0) > 0)
     order by d.date_depot desc
     limit 1;
  end if;

  if v_email is null or v_email = '' then
    return jsonb_build_object('erreur', 'boutique_sans_email');
  end if;

  select id, jeton into v_lien, v_jeton from public.boutique_liens where email = v_email;
  if v_lien is null then
    v_jeton := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.boutique_liens (email, jeton) values (v_email, v_jeton) returning id into v_lien;
  end if;

  insert into public.boutique_lien_partenaires (lien_id, user_id, boutique_id)
  values (v_lien, p_user, p_boutique)
  on conflict (user_id, boutique_id) do update set lien_id = excluded.lien_id, actif = true;

  return jsonb_build_object('ok', true, 'jeton', v_jeton, 'boutique', v_nom, 'email', v_email);
end;
$$;

-- Côté artisan : la même chose, mais l'artisan vient de sa session, jamais d'un paramètre.
create or replace function public.mon_lien_boutique(boutique_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;
  return public.lien_boutique_assurer(v_user, boutique_param);
end;
$$;

-- --- 2. La trace des rappels envoyés -----------------------------------------------------------
-- Une ligne par (boutique, mois, type). `pris_le` est le bail d'un envoi en cours, `envoye_le` la
-- preuve qu'il est parti ; `erreur` garde la raison d'un échec, qui rend la ligne reprenable.
create table if not exists public.boutique_rappels (
  id uuid primary key default gen_random_uuid(),
  lien_id uuid not null references public.boutique_liens(id) on delete cascade,
  mois date not null,
  type text not null check (type in ('rappel', 'relance')),
  pris_le timestamptz,
  envoye_le timestamptz,
  destinataire text,
  motif text,
  erreur text,
  unique (lien_id, mois, type)
);

-- Aucune policy, volontairement : cette table n'est lue et écrite que par la fonction edge, en
-- service_role. Ce qu'on envoie à quelle boutique ne se lit pas depuis un navigateur.
alter table public.boutique_rappels enable row level security;

-- --- 3. Ce qu'il faut envoyer aujourd'hui ------------------------------------------------------
-- `p_mois` est le mois de l'envoi (« 2026-10-01 » pour un rappel parti le 1er octobre) ; l'état
-- rapporté, lui, est celui du mois précédent — ce que la boutique a déclaré — plus ce qu'il lui
-- reste d'après nos comptes.
create or replace function public.rappels_boutiques_a_envoyer(
  p_type text,
  p_mois date,
  p_reserver boolean default true,
  p_nouveaux boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      left join public.profil_entreprise pe on pe.user_id = p.user_id
     where p.actif
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
           -- été déposé, et l'app le signale déjà à l'artisan (0052).
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
$$;

-- --- 4. Refermer la ligne après l'envoi --------------------------------------------------------
-- `p_erreur` à null = parti : la ligne porte la date, et le mois est clos pour cette boutique.
-- Sinon la ligne garde la raison de l'échec et reste reprenable.
create or replace function public.marquer_rappel_boutique(
  p_lien uuid,
  p_mois date,
  p_type text,
  p_destinataire text default null,
  p_erreur text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.boutique_rappels
     set envoye_le = case when p_erreur is null then now() else envoye_le end,
         destinataire = coalesce(nullif(btrim(p_destinataire), ''), destinataire),
         erreur = nullif(btrim(p_erreur), '')
   where lien_id = p_lien
     and mois = date_trunc('month', p_mois)::date
     and type = p_type
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('erreur', 'rappel_inconnu');
  end if;
  return jsonb_build_object('ok', true, 'envoye', p_erreur is null);
end;
$$;

-- --- 5. Le réglage qui arme les envois ---------------------------------------------------------
-- Un cron qui existe et n'envoie rien est plus honnête qu'un envoi décidé à la place de
-- l'utilisateur. Passer la valeur à 'oui' est le seul geste d'armement.
insert into public.reglages_produit (cle, valeur) values ('rappels_boutiques_actifs', 'non')
on conflict (cle) do nothing;

-- --- 6. Droits ---------------------------------------------------------------------------------
-- `mon_lien_boutique` était déjà ouverte aux comptes connectés et le reste ; l'interne, elle, ne
-- doit JAMAIS l'être : elle prend l'identifiant du compte en paramètre.
revoke all on function public.lien_boutique_assurer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rappels_boutiques_a_envoyer(text, date, boolean, boolean) from public, anon, authenticated;
revoke all on function public.marquer_rappel_boutique(uuid, date, text, text, text) from public, anon, authenticated;

grant execute on function public.lien_boutique_assurer(uuid, uuid) to service_role;
grant execute on function public.rappels_boutiques_a_envoyer(text, date, boolean, boolean) to service_role;
grant execute on function public.marquer_rappel_boutique(uuid, date, text, text, text) to service_role;

revoke all on function public.mon_lien_boutique(uuid) from public, anon;
grant execute on function public.mon_lien_boutique(uuid) to authenticated;

-- --- 7. Le cron --------------------------------------------------------------------------------
-- Tous les jours à 07:00 UTC : la fonction décide elle-même de ce qui est dû (le 1er, le rappel ;
-- le 5, la relance) et reprend les envois restés en panne. Un seul passage quotidien porte les
-- trois cas, là où deux crons distincts ne sauraient pas rattraper un échec.
select cron.schedule(
  'boutique-rappels',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/boutique-rappels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'assistant_cron_secret')
    ),
    body := jsonb_build_object('mode', 'quotidien'),
    timeout_milliseconds := 60000
  );
  $$
);
