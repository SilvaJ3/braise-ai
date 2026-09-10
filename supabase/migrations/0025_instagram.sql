-- V2.5 (proto) — connexion Instagram : OAuth (Instagram API with Instagram Login, sans Page
-- Facebook requise), publication directe + planifiée depuis le planning.

-- Un compte Instagram connecté par utilisateur.
create table public.instagram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  ig_user_id text not null,
  ig_username text,
  access_token text not null,
  token_expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.instagram_accounts enable row level security;

create policy "instagram_accounts: own row" on public.instagram_accounts
  for select using (user_id = (select auth.uid()));
create policy "instagram_accounts: own row - delete" on public.instagram_accounts
  for delete using (user_id = (select auth.uid()));
-- insert/update réservés au rôle service (edge function `instagram-oauth`), jamais au client :
-- le token d'accès ne doit pas pouvoir être écrit depuis le front.

-- État OAuth éphémère : relie le callback Meta (sans session) à l'utilisateur qui a initié
-- la connexion. Consommé (supprimé) au premier callback, expire de lui-même après 10 min.
create table public.oauth_states (
  state uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.oauth_states enable row level security;
create policy "oauth_states: own row - insert" on public.oauth_states
  for insert with check (user_id = (select auth.uid()));
-- select/delete réservés au rôle service (callback non authentifié par JWT utilisateur).

create index oauth_states_created_idx on public.oauth_states (created_at);

-- Publication : image jointe + suivi de l'envoi vers Instagram.
alter table public.content_entries
  add column image_path text,
  add column publish_status text check (publish_status in ('en_attente', 'publie', 'erreur')),
  add column publish_error text,
  add column ig_media_id text;

-- Stockage des visuels : bucket public (l'API Instagram doit pouvoir lire l'image par URL).
-- Chemin `<user_id>/<entry_id>.<ext>`, pas de donnée sensible dans ce bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-media', 'content-media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "content-media: own files - select" on storage.objects
  for select using (bucket_id = 'content-media');
create policy "content-media: own files - insert" on storage.objects
  for insert with check (
    bucket_id = 'content-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "content-media: own files - update" on storage.objects
  for update using (
    bucket_id = 'content-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "content-media: own files - delete" on storage.objects
  for delete using (
    bucket_id = 'content-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
