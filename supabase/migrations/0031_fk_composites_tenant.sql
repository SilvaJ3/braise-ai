-- 0031 — Intégrité inter-tenant par clés étrangères composites.
--
-- La migration 0028 avait durci 6 tables avec des policies `exists (select 1 from parent
-- where id = xxx_id and user_id = auth.uid())`. Deux limites : 12 autres FK inter-tables
-- restaient nues, et surtout une policy ne protège QUE l'accès PostgREST authentifié — les
-- edge functions (service_role) et les triggers la contournent entièrement.
--
-- Une FK composite (user_id, parent_id) → (user_id, id) protège tous les chemins d'écriture,
-- sans exception, et se vérifie par index plutôt que par sous-requête.
--
-- PG 15+ requis pour `on delete set null (colonne)` : sans la colonne ciblée, un SET NULL
-- global mettrait aussi user_id à NULL et violerait le `not null`.

-- Index uniques sur les parents : support obligatoire de la FK composite.
create unique index if not exists boutiques_user_id_id_idx on public.boutiques (user_id, id);
create unique index if not exists produits_user_id_id_idx on public.produits (user_id, id);
create unique index if not exists fournisseurs_user_id_id_idx on public.fournisseurs (user_id, id);
create unique index if not exists matieres_premieres_user_id_id_idx on public.matieres_premieres (user_id, id);
create unique index if not exists content_entries_user_id_id_idx on public.content_entries (user_id, id);
create unique index if not exists depots_user_id_id_idx on public.depots (user_id, id);
create unique index if not exists commandes_user_id_id_idx on public.commandes (user_id, id);
create unique index if not exists marches_user_id_id_idx on public.marches (user_id, id);
create unique index if not exists commandes_fournisseur_user_id_id_idx on public.commandes_fournisseur (user_id, id);

-- Références vers une boutique ----------------------------------------------------------------

alter table public.content_entries drop constraint if exists content_entries_boutique_id_fkey;
alter table public.content_entries
  add constraint content_entries_boutique_tenant
  foreign key (user_id, boutique_id) references public.boutiques (user_id, id)
  on delete set null (boutique_id);

alter table public.depots drop constraint if exists depots_boutique_id_fkey;
alter table public.depots
  add constraint depots_boutique_tenant
  foreign key (user_id, boutique_id) references public.boutiques (user_id, id)
  on delete set null (boutique_id);

alter table public.commandes drop constraint if exists commandes_boutique_id_fkey;
alter table public.commandes
  add constraint commandes_boutique_tenant
  foreign key (user_id, boutique_id) references public.boutiques (user_id, id)
  on delete set null (boutique_id);

alter table public.assistant_suggestions drop constraint if exists assistant_suggestions_boutique_id_fkey;
alter table public.assistant_suggestions
  add constraint assistant_suggestions_boutique_tenant
  foreign key (user_id, boutique_id) references public.boutiques (user_id, id)
  on delete cascade;

-- Références vers un produit ------------------------------------------------------------------

alter table public.depot_lignes drop constraint if exists depot_lignes_produit_id_fkey;
alter table public.depot_lignes
  add constraint depot_lignes_produit_tenant
  foreign key (user_id, produit_id) references public.produits (user_id, id)
  on delete set null (produit_id);

alter table public.commande_lignes drop constraint if exists commande_lignes_produit_id_fkey;
alter table public.commande_lignes
  add constraint commande_lignes_produit_tenant
  foreign key (user_id, produit_id) references public.produits (user_id, id)
  on delete set null (produit_id);

alter table public.marche_lignes drop constraint if exists marche_lignes_produit_id_fkey;
alter table public.marche_lignes
  add constraint marche_lignes_produit_tenant
  foreign key (user_id, produit_id) references public.produits (user_id, id)
  on delete set null (produit_id);

-- Références vers un fournisseur ou une matière ------------------------------------------------

alter table public.matieres_premieres drop constraint if exists matieres_premieres_fournisseur_id_fkey;
alter table public.matieres_premieres
  add constraint matieres_premieres_fournisseur_tenant
  foreign key (user_id, fournisseur_id) references public.fournisseurs (user_id, id)
  on delete set null (fournisseur_id);

alter table public.commandes_fournisseur drop constraint if exists commandes_fournisseur_fournisseur_id_fkey;
alter table public.commandes_fournisseur
  add constraint commandes_fournisseur_fournisseur_tenant
  foreign key (user_id, fournisseur_id) references public.fournisseurs (user_id, id);

alter table public.commande_fournisseur_lignes drop constraint if exists commande_fournisseur_lignes_matiere_id_fkey;
alter table public.commande_fournisseur_lignes
  add constraint commande_fournisseur_lignes_matiere_tenant
  foreign key (user_id, matiere_id) references public.matieres_premieres (user_id, id);

alter table public.assistant_suggestions drop constraint if exists assistant_suggestions_matiere_id_fkey;
alter table public.assistant_suggestions
  add constraint assistant_suggestions_matiere_tenant
  foreign key (user_id, matiere_id) references public.matieres_premieres (user_id, id)
  on delete cascade;

alter table public.assistant_suggestions drop constraint if exists assistant_suggestions_source_id_fkey;
alter table public.assistant_suggestions
  add constraint assistant_suggestions_source_tenant
  foreign key (user_id, source_id) references public.content_entries (user_id, id)
  on delete set null (source_id);

-- Références lignes → parent : les policies de 0028 deviennent redondantes mais restent en
-- place (elles filtrent la lecture PostgREST). La FK composite, elle, tient pour tout le monde.

alter table public.depot_lignes drop constraint if exists depot_lignes_depot_id_fkey;
alter table public.depot_lignes
  add constraint depot_lignes_depot_tenant
  foreign key (user_id, depot_id) references public.depots (user_id, id)
  on delete cascade;

alter table public.commande_lignes drop constraint if exists commande_lignes_commande_id_fkey;
alter table public.commande_lignes
  add constraint commande_lignes_commande_tenant
  foreign key (user_id, commande_id) references public.commandes (user_id, id)
  on delete cascade;

alter table public.marche_lignes drop constraint if exists marche_lignes_marche_id_fkey;
alter table public.marche_lignes
  add constraint marche_lignes_marche_tenant
  foreign key (user_id, marche_id) references public.marches (user_id, id)
  on delete cascade;

alter table public.commande_fournisseur_lignes drop constraint if exists commande_fournisseur_lignes_commande_fournisseur_id_fkey;
alter table public.commande_fournisseur_lignes
  add constraint commande_fournisseur_lignes_parent_tenant
  foreign key (user_id, commande_fournisseur_id) references public.commandes_fournisseur (user_id, id)
  on delete cascade;
