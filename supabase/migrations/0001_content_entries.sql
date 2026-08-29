-- V1: planning réseaux sociaux. Single-user, RLS by auth.uid().
create table public.content_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  product text,
  type text check (type in ('post','story','reel')),
  platform text check (platform in ('instagram','facebook','tiktok')),
  date date,
  notes text,
  status text not null default 'idee' check (status in ('idee','a_faire','planifie','publie')),
  reminder_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.content_entries enable row level security;

create policy "own rows - select" on public.content_entries
  for select using (user_id = auth.uid());
create policy "own rows - insert" on public.content_entries
  for insert with check (user_id = auth.uid());
create policy "own rows - update" on public.content_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows - delete" on public.content_entries
  for delete using (user_id = auth.uid());

create index content_entries_user_date_idx on public.content_entries (user_id, date);
create index content_entries_user_reminder_idx on public.content_entries (user_id, reminder_at);
