-- Journal d'usage léger pour piloter la phase de test (voir qui utilise quoi)
create table public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_events enable row level security;

create policy "own rows - insert" on public.app_events
  for insert with check (user_id = auth.uid());
create policy "own rows - select" on public.app_events
  for select using (user_id = auth.uid());

create index app_events_created_idx on public.app_events (created_at desc);
create index app_events_name_idx on public.app_events (name, created_at desc);
