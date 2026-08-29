-- Historique de chat persistant + réponses générées en arrière-plan.
-- Une conversation continue par utilisateur (l'app n'a qu'un écran de chat).
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  status text not null default 'done' check (status in ('pending', 'done', 'error')),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "chat_messages: own rows"
  on public.chat_messages for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);
