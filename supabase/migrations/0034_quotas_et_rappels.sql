-- 0034 — Les quotas anti-abus deviennent infalsifiables, et un rappel n'est plus perdu
-- définitivement quand son envoi échoue.
--
-- 1) Quotas
--
-- Les deux seules protections de l'assistant (40 questions/heure, anti-spam 10 min du bilan)
-- étaient calculées à partir de `chat_messages` et `assistant_suggestions`, deux tables que
-- l'utilisateur peut SUPPRIMER via l'API REST (leurs policies sont `for all`). En effaçant ses
-- questions de la dernière heure, un compte remettait le compteur à zéro et rappelait le modèle
-- autant qu'il voulait : le plafond de coût annoncé n'était pas appliqué.
--
-- Aggravant : le quota du bilan comptait les idées PRODUITES et non les runs. Depuis que le
-- filtre anti-doublon écarte les idées déjà connues, un run pouvait ne rien insérer et laisser
-- le compteur à 0 — un appel LLM complet par clic sur « Générer des idées ».

create table public.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, kind, window_start)
);

-- Aucune policy : cette table n'est lisible et modifiable que par service_role (les edge
-- functions). C'est tout l'intérêt — le client ne peut ni la lire ni la purger.
alter table public.rate_limits enable row level security;

-- Consomme une unité et dit si l'appel est autorisé. L'upsert est atomique : deux requêtes
-- simultanées ne peuvent pas lire le même compteur (contrairement à l'ancien « lire puis agir »).
create or replace function public.consommer_quota(
  p_user uuid,
  p_kind text,
  p_max int,
  p_fenetre_sec int
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_fenetre_sec) * p_fenetre_sec
  );
  v_count int;
begin
  insert into public.rate_limits (user_id, kind, window_start, count)
  values (p_user, p_kind, v_start, 1)
  on conflict (user_id, kind, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max;
end $$;

revoke all on function public.consommer_quota(uuid, text, int, int) from public, anon, authenticated;

-- Ménage : les fenêtres anciennes ne servent plus à rien.
create or replace function public.purger_rate_limits() returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limits where window_start < now() - interval '7 days';
$$;

revoke all on function public.purger_rate_limits() from public, anon, authenticated;

-- 2) Rappels : tentatives et erreur, au lieu d'un marqueur à sens unique ----------------------
--
-- `reminder_sent_at` servait à la fois de verrou et de trace d'envoi, et n'était jamais remis à
-- zéro. Un envoi qui échouait (abonnement push expiré, service en erreur, aucun abonnement
-- actif) consommait donc définitivement le rappel : perte silencieuse, sans compteur ni rejeu,
-- alors que le rappel est la promesse centrale de V1.5.

alter table public.content_entries
  add column reminder_attempts smallint not null default 0,
  add column reminder_error text check (reminder_error is null or char_length(reminder_error) <= 500);

-- L'index des rappels dus exclut désormais ceux qui ont déjà échoué trois fois : un rappel
-- irrécupérable cesse d'être retenté à chaque passage du cron.
drop index if exists public.content_entries_reminder_due_idx;

create index content_entries_reminder_due_idx on public.content_entries (reminder_at)
  where reminder_at is not null and reminder_sent_at is null and reminder_attempts < 3;
