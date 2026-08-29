-- Assistant IA (contenu) : source des entrées + file de suggestions poussées

alter table public.content_entries
  add column source text not null default 'manuel'
  check (source in ('manuel','assistant'));

create table public.assistant_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('idee_contenu','observation')),
  message text not null,
  source_id uuid references public.content_entries(id) on delete set null,
  statut text not null default 'nouveau' check (statut in ('nouveau','vu','traite')),
  created_at timestamptz not null default now()
);

alter table public.assistant_suggestions enable row level security;

create policy "own rows - select" on public.assistant_suggestions
  for select using (user_id = auth.uid());
create policy "own rows - insert" on public.assistant_suggestions
  for insert with check (user_id = auth.uid());
create policy "own rows - update" on public.assistant_suggestions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows - delete" on public.assistant_suggestions
  for delete using (user_id = auth.uid());

create index assistant_suggestions_user_statut_idx
  on public.assistant_suggestions (user_id, statut, created_at desc);

-- Vérif du secret partagé du cron, sans exposer le schéma vault via l'API
create or replace function public.verify_cron_secret(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'assistant_cron_secret'
      and decrypted_secret = candidate
  );
$$;

revoke all on function public.verify_cron_secret(text) from public, anon, authenticated;
