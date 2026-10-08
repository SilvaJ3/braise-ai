-- 0090 — Le « stock a bougé » devient UN message groupé, après une période calme.
--
-- Décision de JSB (04/10/2026), écrite noir sur blanc dans
-- `projets-clients/braaise-lara/PLAN-BOUTIQUE-FULL.md` :
--
--   « Un seul message par (artisan, boutique) résumant toutes les déclarations depuis le dernier
--     message, envoyé après une période sans nouvelle déclaration (30 min proposées), avec un
--     plafond par jour. Pas de cooldown « à la déclaration » : donc `0079` ne s'applique PAS telle
--     quelle. Réalisation = migration à écrire APRÈS le rejeu des migrations 0080-0082 ; réglage
--     d'armement séparé, désarmé par défaut. »
--
-- Les 0080-0082 sont au registre : la condition est remplie. La 0079, elle, notifiait à la
-- déclaration avec un cooldown de cinq minutes par couple (artisan, boutique) — et, pire, les
-- déclarations tombées PENDANT le cooldown n'étaient jamais annoncées. Un inventaire fait en trois
-- envois rapprochés pouvait donc n'annoncer que le premier.
--
-- Ce que cette migration change, exactement :
--   1. `notifier_stock_mouvement(...)` — MÊME signature, autre comportement : au lieu d'envoyer,
--      elle CUMULE dans une table d'attente (une ligne par couple artisan × boutique).
--   2. `envoyer_stock_notifs_lots()` — la fonction que le cron appelle : elle envoie un message
--      groupé pour chaque couple dont la dernière déclaration date de plus que la période calme,
--      dans la limite du plafond du jour, puis efface la ligne d'attente.
--   3. Trois réglages produit, tous NOUVEAUX : `notifs_stock_actives` (armement séparé, `non` par
--      défaut — donc rien ne part tant que JSB ne l'a pas armé), `notifs_stock_calme_min` (30) et
--      `notifs_stock_max_jour` (3 messages par couple et par jour).
--   4. Deux changements d'infrastructure : l'anti-doublon `notifications_cooldown` de la 0079 est
--      retiré (son rôle est repris par la période calme), et un job pg_cron de cinq minutes appelle
--      `envoyer_stock_notifs_lots()`.
--
-- `boutique_declarer` N'EST PAS retouchée : elle appelle déjà `notifier_stock_mouvement(...)` (le
-- câblage posé par la 0079, vérifié en base). Changer le comportement de cette fonction suffit.
--
-- Désarmé par défaut : tant que `notifs_stock_actives` vaut autre que `oui`, cette migration ne
-- change RIEN au comportement observable — `notifier_stock_mouvement` ne pose pas de ligne, et le
-- cron ne trouve rien à envoyer.

-- --- 1. Les trois réglages ---------------------------------------------------------------------
-- `on conflict do nothing` : une valeur déjà posée à la main n'est jamais écrasée par une migration.
insert into public.reglages_produit (cle, valeur) values
  ('notifs_stock_actives',   'non'),
  ('notifs_stock_calme_min', '30'),
  ('notifs_stock_max_jour',  '3')
on conflict (cle) do nothing;

-- --- 2. La table d'attente ---------------------------------------------------------------------
-- Une ligne par (artisan, boutique) : le groupe qui attend son message. Elle ne se lit pas depuis
-- un navigateur — RLS activée, et aucun droit pour `anon`/`authenticated`.
create table if not exists public.stock_notifs_attente (
  user_id      uuid not null,
  boutique_id  uuid not null,
  -- Le premier événement du groupe : sert à lire « depuis … » dans un éventuel détail.
  debut        timestamptz not null default now(),
  -- Le dernier événement : c'est LUI qui décide si la période calme est écoulée.
  derniere     timestamptz not null default now(),
  declarations int not null default 0,
  nb_lignes    int not null default 0,
  facturable   numeric not null default 0,
  -- La période la plus ANCIENNE du groupe : un message qui couvre deux mois se lit au plus tôt.
  periode      date not null,
  primary key (user_id, boutique_id)
);

alter table public.stock_notifs_attente enable row level security;

revoke all on table public.stock_notifs_attente from anon, authenticated;

comment on table public.stock_notifs_attente is
  'Déclarations de vente en attente d''un message groupé : une ligne par (artisan, boutique), envoyée après une période calme (0090).';

-- --- 3. `notifier_stock_mouvement` : de l''envoi immédiat au cumul --------------------------------
-- MÊME signature que la 0079 — `boutique_declarer` n''a pas à être retouchée.
create or replace function public.notifier_stock_mouvement(
  p_user uuid, p_boutique uuid, p_declaration uuid,
  p_facturable numeric, p_nb_lignes int, p_periode date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actif text;
begin
  if p_user is null or p_boutique is null then return null; end if;

  select valeur into v_actif from public.reglages_produit where cle = 'notifs_stock_actives';
  if coalesce(v_actif, 'non') <> 'oui' then
    return null;  -- armement séparé, désarmé par défaut : rien ne se cumule tant qu'il est fermé
  end if;

  insert into public.stock_notifs_attente
    (user_id, boutique_id, debut, derniere, declarations, nb_lignes, facturable, periode)
  values
    (p_user, p_boutique, now(), now(), 1,
     greatest(coalesce(p_nb_lignes, 0), 0), greatest(coalesce(p_facturable, 0), 0),
     coalesce(p_periode, (now() at time zone 'Europe/Brussels')::date))
  on conflict (user_id, boutique_id) do update set
    derniere     = now(),
    declarations = public.stock_notifs_attente.declarations + 1,
    nb_lignes    = public.stock_notifs_attente.nb_lignes + greatest(coalesce(p_nb_lignes, 0), 0),
    facturable   = public.stock_notifs_attente.facturable + greatest(coalesce(p_facturable, 0), 0),
    periode      = least(public.stock_notifs_attente.periode,
                         coalesce(p_periode, public.stock_notifs_attente.periode));

  return null;  -- rien n''est envoyé ici : le message part du cron, après la période calme
end;
$function$;

-- --- 4. L''envoi groupé, appelé par le cron ------------------------------------------------------
-- `security definer` : elle écrit dans `notifications_artisan` et lit `reglages_produit`, deux
-- tables fermées aux clients. Elle rend le nombre de messages réellement posés.
create or replace function public.envoyer_stock_notifs_lots()
returns int
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actif text;
  v_calme interval;
  v_max int;
  v_jour date := (now() at time zone 'Europe/Brussels')::date;
  r record;
  v_envoyes int := 0;
begin
  select valeur into v_actif from public.reglages_produit where cle = 'notifs_stock_actives';
  if coalesce(v_actif, 'non') <> 'oui' then return 0; end if;

  select make_interval(mins => greatest(coalesce(nullif(regexp_replace(valeur, '\D', '', 'g'), '')::int, 30), 1))
    into v_calme
    from public.reglages_produit where cle = 'notifs_stock_calme_min';
  if v_calme is null then v_calme := interval '30 minutes'; end if;

  select greatest(coalesce(nullif(regexp_replace(valeur, '\D', '', 'g'), '')::int, 3), 1)
    into v_max
    from public.reglages_produit where cle = 'notifs_stock_max_jour';
  if v_max is null then v_max := 3; end if;

  for r in
    select * from public.stock_notifs_attente
     where derniere <= now() - v_calme
     order by derniere, user_id, boutique_id
  loop
    -- Plafond du jour, par couple : au-delà, on ne supprime pas la ligne — le groupe grossit et
    -- repartira le lendemain, comme le veut la décision (« un plafond par jour »).
    if (select count(*) from public.notifications_artisan n
         where n.user_id = r.user_id
           and n.type = 'stock_mouvement'
           and n.ref->>'boutique_id' = r.boutique_id::text
           and (n.cree_le at time zone 'Europe/Brussels')::date = v_jour) >= v_max then
      continue;
    end if;

    perform public.notifier_artisan(
      r.user_id, 'stock_mouvement',
      jsonb_build_object(
        'boutique_id',  r.boutique_id,
        'nb_lignes',    r.nb_lignes,
        'facturable',   r.facturable,
        'periode',      to_char(r.periode, 'YYYY-MM'),
        'declarations', r.declarations));

    delete from public.stock_notifs_attente
     where user_id = r.user_id and boutique_id = r.boutique_id;

    v_envoyes := v_envoyes + 1;
  end loop;

  return v_envoyes;
end;
$function$;

-- --- 5. La fin de l''anti-doublon de la 0079 -------------------------------------------------------
-- Sa raison d''être (ne pas répéter un message à chaque déclaration) est reprise par la période
-- calme : la table n''a plus de lecteur ni d''écrivain, on la retire plutôt que de laisser du
-- poids mort que quelqu''un rebrancherait par erreur.

drop table if exists public.notifications_cooldown;

-- --- 6. Le cron ---------------------------------------------------------------------------------
-- Toutes les cinq minutes, comme le rattrapage des notifications : le cron ne fait rien tant que
-- l'armement est fermé, et rien quand aucun groupe n'a fini sa période calme.
do $cron$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'notifs-stock-lots';
  if v_id is not null then
    perform cron.unschedule(v_id);
  end if;
end
$cron$;

select cron.schedule(
  'notifs-stock-lots',
  '*/5 * * * *',
  'select public.envoyer_stock_notifs_lots();'
);

-- --- 7. Permissions -----------------------------------------------------------------------------
revoke all on function public.notifier_stock_mouvement(uuid, uuid, uuid, numeric, int, date)
  from public, anon, authenticated;
grant execute on function public.notifier_stock_mouvement(uuid, uuid, uuid, numeric, int, date)
  to service_role;

revoke all on function public.envoyer_stock_notifs_lots() from public, anon, authenticated;
grant execute on function public.envoyer_stock_notifs_lots() to service_role;
