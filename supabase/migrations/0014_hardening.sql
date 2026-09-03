-- Durcissement (audit) :
--  1. Policies RLS réécrites avec (select auth.uid()) : évaluées une fois par requête et non
--     par ligne (advisor Supabase "auth_rls_initplan").
--  2. Index manquants sur les FK signalées par l'advisor.
--  3. Garde-fous de taille sur les textes saisis (évite qu'une réponse LLM ou un copier-coller
--     géant ne gonfle la base / le contexte de l'assistant).

-- 1. RLS ---------------------------------------------------------------------------------

drop policy if exists "own rows - select" on public.content_entries;
drop policy if exists "own rows - insert" on public.content_entries;
drop policy if exists "own rows - update" on public.content_entries;
drop policy if exists "own rows - delete" on public.content_entries;
create policy "content_entries: own rows" on public.content_entries
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own rows - select" on public.assistant_suggestions;
drop policy if exists "own rows - insert" on public.assistant_suggestions;
drop policy if exists "own rows - update" on public.assistant_suggestions;
drop policy if exists "own rows - delete" on public.assistant_suggestions;
create policy "assistant_suggestions: own rows" on public.assistant_suggestions
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own rows - insert" on public.app_events;
drop policy if exists "own rows - select" on public.app_events;
create policy "app_events: own rows - insert" on public.app_events
  for insert with check (user_id = (select auth.uid()));
create policy "app_events: own rows - select" on public.app_events
  for select using (user_id = (select auth.uid()));

drop policy if exists "own rows - select" on public.push_subscriptions;
drop policy if exists "own rows - insert" on public.push_subscriptions;
drop policy if exists "own rows - delete" on public.push_subscriptions;
create policy "push_subscriptions: own rows" on public.push_subscriptions
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own row - select" on public.assistant_profil;
drop policy if exists "own row - insert" on public.assistant_profil;
drop policy if exists "own row - update" on public.assistant_profil;
create policy "assistant_profil: own row" on public.assistant_profil
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own rows - select" on public.produits;
drop policy if exists "own rows - insert" on public.produits;
drop policy if exists "own rows - update" on public.produits;
drop policy if exists "own rows - delete" on public.produits;
create policy "produits: own rows" on public.produits
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "chat_messages: own rows" on public.chat_messages;
create policy "chat_messages: own rows" on public.chat_messages
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "boutiques: own rows" on public.boutiques;
create policy "boutiques: own rows" on public.boutiques
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "boutique_contacts_log: own rows" on public.boutique_contacts_log;
create policy "boutique_contacts_log: own rows" on public.boutique_contacts_log
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 2. Index --------------------------------------------------------------------------------

create index if not exists app_events_user_idx on public.app_events (user_id, created_at desc);
create index if not exists assistant_suggestions_source_idx on public.assistant_suggestions (source_id);
create index if not exists boutique_contacts_log_user_date_idx
  on public.boutique_contacts_log (user_id, date desc);
create index if not exists chat_messages_pending_idx
  on public.chat_messages (user_id, created_at) where status = 'pending';

-- 3. Garde-fous de taille -------------------------------------------------------------------
-- `not valid` : les lignes existantes ne sont pas re-vérifiées (pas de risque de casser la
-- migration), seules les nouvelles écritures sont contraintes.

alter table public.content_entries
  add constraint content_entries_title_len check (char_length(title) <= 300) not valid,
  add constraint content_entries_notes_len check (notes is null or char_length(notes) <= 4000) not valid;

alter table public.chat_messages
  add constraint chat_messages_content_len check (char_length(content) <= 20000) not valid;

alter table public.produits
  add constraint produits_nom_len check (char_length(nom) <= 200) not valid,
  add constraint produits_prix_pos check (prix_vente is null or prix_vente >= 0) not valid;

alter table public.boutiques
  add constraint boutiques_nom_len check (char_length(nom) <= 200) not valid;

alter table public.assistant_profil
  add constraint assistant_profil_len check (char_length(contenu) <= 8000) not valid;
