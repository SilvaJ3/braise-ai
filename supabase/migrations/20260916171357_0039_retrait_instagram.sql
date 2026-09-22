-- 0039 — Retrait de l'intégration Instagram.
--
-- Décision explicite : la publication Instagram (V2.5) était en stand-by depuis le 11/09, et son
-- code ne vivait qu'en production — les migrations 0025_instagram, 0026_instagram_cron et
-- 0027_oauth_states_user_idx n'ont jamais existé dans ce dépôt, et les edge functions
-- `instagram-oauth` / `instagram-publish` non plus. Rien d'auditable, rien de reconstruisible :
-- c'est exactement ce que l'audit du 15/09 signalait, et la réponse est le retrait.
--
-- Aucune donnée n'est perdue : `instagram_accounts`, `oauth_states` et les quatre colonnes de
-- `content_entries` sont vides, et le bucket `content-media` ne contient aucun objet (relevé
-- avant d'écrire cette migration).
--
-- Ce qui reste, volontairement : la valeur 'instagram' comme plateforme de publication dans le
-- planning et comme canal de contact d'une boutique. C'est du suivi manuel, sans rapport avec
-- l'intégration retirée.

-- 1. Le cron de publication programmée (toutes les 10 minutes).

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where command ilike '%instagram-publish%';
  if v_job is null then
    raise notice 'aucun job instagram-publish à retirer';
  else
    perform cron.unschedule(v_job);
  end if;
end $$;

-- 2. Les politiques Storage du bucket.
--
-- Le bucket lui-même se retire par l'API Storage : la base refuse toute écriture directe dans
-- `storage.objects` **et** `storage.buckets` (« Direct deletion from storage tables is not
-- allowed »), y compris une fois les politiques tombées. Retiré le 16/09 par
-- `DELETE /storage/v1/bucket/content-media` — le bucket était vide (relevé avant migration).

drop policy if exists "content-media: own files - select" on storage.objects;
drop policy if exists "content-media: own files - insert" on storage.objects;
drop policy if exists "content-media: own files - update" on storage.objects;
drop policy if exists "content-media: own files - delete" on storage.objects;

-- 3. Les colonnes de publication sur le planning.

alter table public.content_entries
  drop column if exists image_path,
  drop column if exists publish_status,
  drop column if exists publish_error,
  drop column if exists ig_media_id;

-- 4. Les tables de l'intégration (jetons OAuth et états anti-rejeu).

drop table if exists public.oauth_states;
drop table if exists public.instagram_accounts;

-- 5. Dernier filet : plus rien d'Instagram ne doit rester dans public. C'est ce contrôle qui
--    échouera si une prochaine migration ressuscite un objet sans qu'on le remarque.

do $$
declare
  v_reste text;
begin
  select string_agg(c.oid::regclass::text, ', ')
    into v_reste
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (c.relname ilike '%instagram%' or c.relname ilike '%oauth_state%');

  if v_reste is not null then
    raise exception 'objets Instagram encore présents : %', v_reste;
  end if;
end $$;
