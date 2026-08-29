-- V1.5 : notifications push + heure de publication + rappel "X h avant"

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "own rows - select" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "own rows - insert" on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy "own rows - delete" on public.push_subscriptions
  for delete using (user_id = auth.uid());

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Heure de publication + délai de rappel. reminder_at reste la valeur calculée
-- (date + heure - X h) écrite par le client.
alter table public.content_entries
  add column scheduled_time time,
  add column reminder_lead_hours smallint
    check (reminder_lead_hours is null or reminder_lead_hours between 0 and 168);
