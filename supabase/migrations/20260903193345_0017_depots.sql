-- V4 : bons de dépôt signés dans l'app + envoi par mail.
-- Modèle repris du bon de dépôt papier d'Alexandra (en-tête émetteur, infos point de vente,
-- tableau articles / qté / prix TTC, mention des conditions générales, date + signature).
-- Le contrat cadre (13 articles) reste hors app : le bon y renvoie, comme sur le papier.

-- Émetteur : ce qui s'imprime en en-tête du bon ---------------------------------------------

create table public.profil_entreprise (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  nom text not null default '' check (char_length(nom) <= 200),
  adresse text not null default '' check (char_length(adresse) <= 300),
  telephone text not null default '' check (char_length(telephone) <= 50),
  tva text not null default '' check (char_length(tva) <= 50),
  email text not null default '' check (char_length(email) <= 200),
  -- Mention imprimée au-dessus de la signature (renvoi au contrat cadre).
  mention_signature text not null
    default 'EN SIGNANT, J''ACCEPTE LES CONDITIONS GÉNÉRALES INDIQUÉES DANS LE CONTRAT INITIAL :'
    check (char_length(mention_signature) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.profil_entreprise enable row level security;
create policy "profil_entreprise: own row" on public.profil_entreprise
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger profil_entreprise_updated_at before update on public.profil_entreprise
  for each row execute function public.set_updated_at();

-- Aucune donnée pré-remplie ici : chaque utilisateur saisit ses coordonnées dans
-- Compte → Mes coordonnées. La ligne est créée à la première sauvegarde (upsert).

-- Bons de dépôt -----------------------------------------------------------------------------

create table public.depots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  boutique_id uuid references public.boutiques(id) on delete set null,
  -- Numéro attribué à la signature (AAAA-NNN), jamais réutilisé.
  numero text check (numero is null or char_length(numero) <= 30),
  date_depot date not null default current_date,
  statut text not null default 'brouillon' check (statut in ('brouillon','signe','envoye')),

  -- Copie des coordonnées au moment du dépôt : le document doit rester fidèle même si la
  -- fiche boutique change plus tard.
  boutique_nom text not null check (char_length(boutique_nom) between 1 and 200),
  boutique_adresse text check (boutique_adresse is null or char_length(boutique_adresse) <= 400),
  boutique_email text check (boutique_email is null or char_length(boutique_email) <= 200),

  notes text check (notes is null or char_length(notes) <= 2000),

  signataire_nom text check (signataire_nom is null or char_length(signataire_nom) <= 200),
  -- Signature manuscrite : JPEG en base64 (sans préfixe data:), format directement
  -- embarquable dans le PDF. Conservée pour pouvoir régénérer le document à l'identique.
  -- ~20 Ko en pratique, plafonnée à 400 Ko.
  signature_image text check (signature_image is null or char_length(signature_image) <= 400000),
  signed_at timestamptz,

  pdf_path text check (pdf_path is null or char_length(pdf_path) <= 400),
  email_to text[] not null default '{}',
  email_cc text[] not null default '{}',
  sent_at timestamptz,
  send_error text check (send_error is null or char_length(send_error) <= 1000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.depots enable row level security;
create policy "depots: own rows" on public.depots
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create unique index depots_user_numero_idx on public.depots (user_id, numero) where numero is not null;
create index depots_user_date_idx on public.depots (user_id, date_depot desc);
create index depots_boutique_idx on public.depots (boutique_id, date_depot desc);

create trigger depots_updated_at before update on public.depots
  for each row execute function public.set_updated_at();

-- Lignes du bon. `designation` et `prix_unitaire` sont figés à la création (le catalogue peut
-- bouger), `produit_id` ne sert qu'à retrouver l'origine.
create table public.depot_lignes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  depot_id uuid not null references public.depots(id) on delete cascade,
  produit_id uuid references public.produits(id) on delete set null,
  designation text not null check (char_length(designation) between 1 and 300),
  quantite numeric(10,2) not null check (quantite > 0),
  prix_unitaire numeric(10,2) not null default 0 check (prix_unitaire >= 0),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.depot_lignes enable row level security;
create policy "depot_lignes: own rows" on public.depot_lignes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index depot_lignes_depot_idx on public.depot_lignes (depot_id, position);
create index depot_lignes_user_idx on public.depot_lignes (user_id);
create index depot_lignes_produit_idx on public.depot_lignes (produit_id);

-- Stockage des PDF signés -------------------------------------------------------------------
-- Bucket privé ; chemin `<user_id>/<depot_id>.pdf`. Lecture via URL signée uniquement.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('depots', 'depots', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "depots pdf: own files - select" on storage.objects
  for select using (
    bucket_id = 'depots' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "depots pdf: own files - insert" on storage.objects
  for insert with check (
    bucket_id = 'depots' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "depots pdf: own files - delete" on storage.objects
  for delete using (
    bucket_id = 'depots' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
