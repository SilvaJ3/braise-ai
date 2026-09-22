-- Nourrir l'assistant : voix de marque éditable, catalogue produits, retour perf

create table public.assistant_profil (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  contenu text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.assistant_profil enable row level security;
create policy "own row - select" on public.assistant_profil for select using (user_id = auth.uid());
create policy "own row - insert" on public.assistant_profil for insert with check (user_id = auth.uid());
create policy "own row - update" on public.assistant_profil for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Catalogue produits (début de V3, version légère)
create table public.produits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nom text not null,
  senteur text,
  description text,
  prix_vente numeric(10,2),
  saison text check (saison is null or saison in ('toute_annee','printemps','ete','automne','hiver','noel')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.produits enable row level security;
create policy "own rows - select" on public.produits for select using (user_id = auth.uid());
create policy "own rows - insert" on public.produits for insert with check (user_id = auth.uid());
create policy "own rows - update" on public.produits for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows - delete" on public.produits for delete using (user_id = auth.uid());
create index produits_user_idx on public.produits (user_id, actif);

-- Retour de performance sur une publication
alter table public.content_entries
  add column perf text check (perf is null or perf in ('carton','ok','bof'));
