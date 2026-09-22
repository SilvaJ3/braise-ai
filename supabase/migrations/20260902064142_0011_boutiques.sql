-- V2: CRM boutiques — fiches boutique + log de contact manuel + lien planning

create table public.boutiques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nom text not null,
  adresse text,
  horaires jsonb,
  canal_prefere text check (canal_prefere in ('email','telephone','instagram','visite','autre')),
  email text,
  telephone text,
  notes text,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.boutiques enable row level security;

create policy "boutiques: own rows" on public.boutiques
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index boutiques_user_idx on public.boutiques (user_id, actif);

create table public.boutique_contacts_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  date date not null default current_date,
  canal text check (canal in ('email','telephone','instagram','visite','autre')),
  resume text,
  created_at timestamptz not null default now()
);

alter table public.boutique_contacts_log enable row level security;

create policy "boutique_contacts_log: own rows" on public.boutique_contacts_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index boutique_contacts_log_boutique_idx
  on public.boutique_contacts_log (boutique_id, date desc);

-- Lien boutiques <-> content_entries : quelle publication pour quelle boutique
alter table public.content_entries
  add column boutique_id uuid references public.boutiques(id) on delete set null;

create index content_entries_boutique_idx on public.content_entries (boutique_id);
