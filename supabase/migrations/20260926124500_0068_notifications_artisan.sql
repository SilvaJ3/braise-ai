-- 0068 — Ce que la boutique fait, dit à l'artisan : un push ET un mail.
--
-- Le trou : la boutique peut confirmer un bon (0056) et demander un réassort (0057/0061), mais elle
-- le fait seule. L'artisan l'apprend en ouvrant l'app — et seulement s'il l'ouvre. Deux gestes qui
-- engagent la suite (les pièces entrent dans le stock de la boutique ; une commande s'ouvre chez
-- l'artisan) ne peuvent pas attendre qu'il pense à regarder.
--
-- Ce que fait cette migration :
--   1. `notifications_artisan` — une ligne par ÉVÉNEMENT, et deux dates séparées : `push_le` et
--      `mail_le`. Deux canaux, jamais un seul : un appareil dont l'abonnement push a expiré ne doit
--      pas faire disparaître l'information, et la trace dit lequel des deux a porté quoi.
--   2. `notifier_artisan(user, type, ref)` — pose la ligne puis réveille la fonction edge par
--      pg_net, au moment même du clic. L'appel HTTP est gardé : s'il échoue, la ligne est déjà
--      posée, et le cron reprend.
--   3. `notifications_artisan_a_envoyer(reserver)` — ce qui attend, avec un bail de dix minutes :
--      deux exécutions qui se chevauchent ne peuvent pas envoyer deux fois le même message.
--      `marquer_notification_artisan(...)` referme la ligne, canal par canal.
--   4. `boutique_confirmer_bon` et `boutique_commander` notifient : rien d'autre ne change dans ces
--      deux fonctions (les règles de 0056 et 0061 sont reprises telles quelles).
--   5. Le cron des cinq minutes : le rattrapage d'un envoi resté en panne. Un envoi immédiat qui
--      rate ne doit pas se perdre.
--
-- L'armement se fait par un réglage (`notifications_artisan_actives`) : la fonction edge refuse
-- d'envoyer si elle ne vaut pas 'oui', et le dit. Cette notification-là vise le titulaire du compte
-- à propos de sa propre affaire — elle est armée d'emblée, et se coupe en une ligne de SQL.

-- --- 1. La trace, une ligne par événement ------------------------------------------------------
-- Aucune policy, volontairement : cette table ne se lit pas depuis un navigateur. `ref` porte
-- l'identifiant de l'événement (le bon, la commande) ; les textes se reconstruisent à partir de la
-- base, et c'est la base qui reste la vérité.
create table if not exists public.notifications_artisan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null check (type in ('bon_confirme', 'reassort')),
  ref jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  -- Le bail d'un envoi en cours : il empêche deux passages simultanés de traiter la même ligne.
  pris_le timestamptz,
  -- Les deux canaux, réglés séparément. Une date = « canal réglé » : parti, ou impossible (aucun
  -- appareil abonné, aucune adresse) — `erreur` garde alors la raison exacte, et c'est elle qui dit
  -- s'il faut réessayer.
  push_le timestamptz,
  mail_le timestamptz,
  tentative int not null default 0,
  erreur text
);

alter table public.notifications_artisan enable row level security;

-- L'index du cron : ce qui reste à faire, et rien d'autre. Au-delà de cinq tentatives, on arrête :
-- une notification de la veille qui arrive aujourd'hui n'apprend plus grand-chose à personne.
create index if not exists notifications_artisan_a_faire_idx
  on public.notifications_artisan (cree_le)
  where (push_le is null or mail_le is null) and tentative < 5;

-- --- 2. Poser l'événement, et réveiller l'envoi tout de suite -----------------------------------
create or replace function public.notifier_artisan(
  p_user uuid,
  p_type text,
  p_ref jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_secret text;
begin
  if p_user is null or p_type is null or p_type not in ('bon_confirme', 'reassort') then
    return null;
  end if;

  insert into public.notifications_artisan (user_id, type, ref)
  values (p_user, p_type, coalesce(p_ref, '{}'::jsonb))
  returning id into v_id;

  -- L'envoi part d'ici, sans attendre le cron : la boutique vient de cliquer, et l'artisan doit le
  -- voir avant d'avoir refermé l'app. Rien n'est perdu si l'appel échoue — la ligne est posée, et
  -- le passage des cinq minutes la reprend.
  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'assistant_cron_secret';
    if v_secret is not null then
      perform net.http_post(
        url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/notifications-artisan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', v_secret
        ),
        body := jsonb_build_object('mode', 'traiter', 'id', v_id),
        timeout_milliseconds := 30000
      );
    end if;
  exception when others then
    -- La notification ne doit jamais faire échouer le geste de la boutique : le bon est confirmé,
    -- la commande est posée. Le cron reprendra l'envoi.
    null;
  end;

  return v_id;
end;
$$;

-- --- 3. Ce qui attend, et refermer une ligne ----------------------------------------------------
-- `p_reserver = false` : on regarde, on ne prend rien, et surtout on n'écrit rien — le mode aperçu
-- ne doit pas consommer les envois. Le retrait des lignes est écrit AVANT la lecture, dans le
-- `update ... from`, parce qu'un `with` modificatrice s'exécute de toute façon.
create or replace function public.notifications_artisan_a_envoyer(
  p_reserver boolean default true,
  p_max int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultat jsonb;
begin
  with dues as (
    select id from public.notifications_artisan
     where (push_le is null or mail_le is null)
       and tentative < 5
       and (pris_le is null or pris_le < now() - interval '10 minutes')
     order by cree_le
     limit greatest(coalesce(p_max, 20), 1)
  ), pris as (
    update public.notifications_artisan n
       set pris_le = now()
      from dues d
     where n.id = d.id
       and p_reserver
    returning n.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'user_id', n.user_id, 'type', n.type, 'ref', n.ref,
           'tentative', n.tentative, 'push_le', n.push_le, 'mail_le', n.mail_le
         ) order by n.cree_le), '[]'::jsonb)
    into v_resultat
    from public.notifications_artisan n
   where n.id in (select id from dues)
     and (not p_reserver or n.id in (select id from pris));

  return v_resultat;
end;
$$;

create or replace function public.marquer_notification_artisan(
  p_id uuid,
  p_push boolean default false,
  p_mail boolean default false,
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
  update public.notifications_artisan
     set push_le = case when p_push then coalesce(push_le, now()) else push_le end,
         mail_le = case when p_mail then coalesce(mail_le, now()) else mail_le end,
         tentative = tentative + 1,
         erreur = nullif(btrim(p_erreur), '')
   where id = p_id
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('erreur', 'notification_inconnue');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- --- 4. Les deux gestes de la boutique notifient ------------------------------------------------
-- Reprise exacte de 0056, plus la notification — et seulement quand la confirmation vient d'avoir
-- lieu : une confirmation déjà posée n'a rien à réannoncer.
create or replace function public.boutique_confirmer_bon(jeton_param text, bon_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien uuid;
  v_bon uuid;
  v_numero text;
  v_user uuid;
  v_boutique uuid;
  v_confirme timestamptz;
begin
  select l.id into v_lien from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;
  if v_lien is null then return jsonb_build_object('erreur', 'lien_invalide'); end if;

  -- Le bon doit appartenir à un couple rattaché à CE lien, et avoir été validé par l'artisan.
  select d.id, d.numero, d.user_id, d.boutique_id, d.confirme_le
    into v_bon, v_numero, v_user, v_boutique, v_confirme
    from public.depots d
    join public.boutique_lien_partenaires p
      on p.user_id = d.user_id and p.boutique_id = d.boutique_id
   where d.id = bon_param
     and p.lien_id = v_lien
     and p.actif
     and d.archived_at is null
     and d.statut in ('envoye', 'signe');

  if v_bon is null then
    return jsonb_build_object('erreur', 'bon_inconnu');
  end if;

  update public.depots set confirme_le = coalesce(confirme_le, now()) where id = v_bon;

  if v_confirme is null then
    perform public.notifier_artisan(
      v_user, 'bon_confirme',
      jsonb_build_object('bon_id', v_bon, 'numero', v_numero, 'boutique_id', v_boutique)
    );
  end if;

  return jsonb_build_object('ok', true, 'bon', v_numero, 'annonce', v_confirme is null);
end;
$$;

-- Reprise exacte de 0061 (catalogue compris), plus la notification : la demande est posée, puis
-- annoncée. Une demande sans ligne valide n'ouvre pas de commande — donc rien à annoncer.
create or replace function public.boutique_commander(jeton_param text, partenaire_param uuid, lignes_param jsonb, note_param text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_lien uuid;
  v_user uuid;
  v_boutique uuid;
  v_entree jsonb;
  v_id uuid;
  v_delai int;
  v_echeance date;
  v_nb int := 0;
  v_qte numeric;
  v_cle text;
  v_pid uuid;
  v_designation text;
begin
  select l.id into v_lien from public.boutique_liens l where l.jeton = jeton_param and l.actif;
  if v_lien is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;

  select p.user_id, p.boutique_id into v_user, v_boutique
    from public.boutique_lien_partenaires p
   where p.id = partenaire_param and p.lien_id = v_lien and p.actif;
  if v_user is null then
    return jsonb_build_object('erreur', 'partenaire_inconnu');
  end if;

  if lignes_param is null or jsonb_typeof(lignes_param) <> 'array' or jsonb_array_length(lignes_param) = 0 then
    return jsonb_build_object('erreur', 'aucune_demande');
  end if;

  select coalesce(delai_semaines, 2) into v_delai from public.profil_entreprise where user_id = v_user;
  v_echeance := current_date + make_interval(weeks => coalesce(v_delai, 2));

  -- La demande devient une commande boutique ordinaire, au premier de ses statuts : elle arrive
  -- là où l'artisan travaille déjà.
  insert into public.commandes (user_id, type, boutique_id, date_echeance, statut, notes)
  values (v_user, 'boutique', v_boutique, v_echeance, 'demande', nullif(trim(note_param), ''))
  returning id into v_id;

  for v_entree in select * from jsonb_array_elements(lignes_param) loop
    v_qte := coalesce((v_entree->>'quantite')::numeric, 0);
    v_cle := nullif(btrim(v_entree->>'cle'), '');
    continue when v_qte <= 0 or v_cle is null;

    -- Les deux cibles sont remises à zéro À CHAQUE TOUR : sans ça, une clé sans résultat garde la
    -- valeur du tour précédent, et la demande part avec la désignation d'une autre pièce.
    v_designation := null;
    v_pid := null;

    -- Le CATALOGUE d'abord : « produit:<uuid> » désigne un produit actif de l'artisan, même si
    -- cette boutique ne l'a jamais reçu — c'est le cas « je voudrais tester cette nouveauté ».
    if v_cle ~ '^produit:[0-9a-fA-F-]{36}$' then
      select pr.nom, pr.id into v_designation, v_pid
        from public.produits pr
       where pr.id = replace(v_cle, 'produit:', '')::uuid
         and pr.user_id = v_user
         and pr.actif;
    end if;

    -- Sinon, une pièce déjà reçue chez cette boutique : on garde le chemin d'origine.
    if v_designation is null then
      select max(dl.designation), max(dl.produit_id::text)::uuid into v_designation, v_pid
        from public.depot_lignes dl
        join public.depots d on d.id = dl.depot_id
       where d.user_id = v_user and d.boutique_id = v_boutique and coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) = v_cle;
    end if;
    continue when v_designation is null;

    insert into public.commande_lignes (user_id, commande_id, produit_id, designation, quantite, deja_en_stock, position)
    values (v_user, v_id, v_pid, v_designation, v_qte, false, v_nb);
    v_nb := v_nb + 1;
  end loop;

  if v_nb = 0 then
    delete from public.commandes where id = v_id;   -- rien de valide : on n'ouvre pas la commande
    return jsonb_build_object('erreur', 'aucune_demande');
  end if;

  perform public.notifier_artisan(
    v_user, 'reassort',
    jsonb_build_object('commande_id', v_id, 'boutique_id', v_boutique, 'lignes', v_nb)
  );

  return jsonb_build_object('ok', true, 'commande_id', v_id, 'echeance', v_echeance, 'lignes', v_nb);
end;
$$;

-- --- 5. Le réglage qui arme les envois ----------------------------------------------------------
-- Ces messages visent le titulaire du compte, à propos de sa propre affaire : ils sont armés
-- d'emblée. Les couper est une ligne de SQL, et la fonction edge le dit quand elle est coupée.
insert into public.reglages_produit (cle, valeur) values ('notifications_artisan_actives', 'oui')
on conflict (cle) do nothing;

-- --- 6. Droits ----------------------------------------------------------------------------------
-- Rien de tout cela ne se lit ni ne s'appelle depuis un navigateur : la boutique passe par les
-- fonctions publiques, qui appellent celles-ci en `security definer`.
revoke all on function public.notifier_artisan(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.notifications_artisan_a_envoyer(boolean, int) from public, anon, authenticated;
revoke all on function public.marquer_notification_artisan(uuid, boolean, boolean, text) from public, anon, authenticated;

grant execute on function public.notifier_artisan(uuid, text, jsonb) to service_role;
grant execute on function public.notifications_artisan_a_envoyer(boolean, int) to service_role;
grant execute on function public.marquer_notification_artisan(uuid, boolean, boolean, text) to service_role;

-- --- 7. Le cron du rattrapage -------------------------------------------------------------------
-- Toutes les cinq minutes : l'envoi immédiat a déjà été tenté au moment du clic ; ce passage ne
-- reprend que ce qui manque. Un service de mail en panne à 14 h 03 doit avoir rattrapé à 14 h 08.
select cron.schedule(
  'notifications-artisan',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/notifications-artisan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'assistant_cron_secret')
    ),
    body := jsonb_build_object('mode', 'traiter'),
    timeout_milliseconds := 60000
  );
  $$
);
