-- Durcissement RLS des tables « lignes ».
--
-- Avant : chaque policy de ligne vérifiait seulement `user_id = auth.uid()`. Le WITH CHECK
-- forçait l'utilisateur à estampiller SON propre user_id, mais n'exigeait pas que le parent
-- référencé (depot_id, commande_id, …) lui appartienne aussi. Un compte pouvait donc insérer
-- une ligne rattachée au parent d'un autre tenant (pollution d'intégrité des agrégats ;
-- ex. le trigger de réception fournisseur somme les lignes par commande sans filtrer user_id).
--
-- Après : on exige en plus que le parent soit possédé par auth.uid(), en USING comme en
-- WITH CHECK. Pas de fuite de confidentialité auparavant, mais l'intégrité inter-tenant est
-- maintenant garantie côté base.

-- depot_lignes → depots
drop policy if exists "depot_lignes: own rows" on public.depot_lignes;
create policy "depot_lignes: own rows" on public.depot_lignes
  for all
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.depots d
      where d.id = depot_id and d.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.depots d
      where d.id = depot_id and d.user_id = (select auth.uid())
    )
  );

-- commande_lignes → commandes
drop policy if exists "commande_lignes: own rows" on public.commande_lignes;
create policy "commande_lignes: own rows" on public.commande_lignes
  for all
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.commandes c
      where c.id = commande_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.commandes c
      where c.id = commande_id and c.user_id = (select auth.uid())
    )
  );

-- commande_fournisseur_lignes → commandes_fournisseur
drop policy if exists "commande_fournisseur_lignes: own rows" on public.commande_fournisseur_lignes;
create policy "commande_fournisseur_lignes: own rows" on public.commande_fournisseur_lignes
  for all
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.commandes_fournisseur cf
      where cf.id = commande_fournisseur_id and cf.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.commandes_fournisseur cf
      where cf.id = commande_fournisseur_id and cf.user_id = (select auth.uid())
    )
  );

-- marche_lignes → marches
drop policy if exists "marche_lignes: own rows" on public.marche_lignes;
create policy "marche_lignes: own rows" on public.marche_lignes
  for all
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.marches m
      where m.id = marche_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.marches m
      where m.id = marche_id and m.user_id = (select auth.uid())
    )
  );

-- produit_recettes → produits + matieres_premieres (deux parents)
drop policy if exists "produit_recettes: own rows" on public.produit_recettes;
create policy "produit_recettes: own rows" on public.produit_recettes
  for all
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.produits p
      where p.id = produit_id and p.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.matieres_premieres mp
      where mp.id = matiere_id and mp.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.produits p
      where p.id = produit_id and p.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.matieres_premieres mp
      where mp.id = matiere_id and mp.user_id = (select auth.uid())
    )
  );

-- boutique_contacts_log → boutiques
drop policy if exists "boutique_contacts_log: own rows" on public.boutique_contacts_log;
create policy "boutique_contacts_log: own rows" on public.boutique_contacts_log
  for all
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.boutiques b
      where b.id = boutique_id and b.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.boutiques b
      where b.id = boutique_id and b.user_id = (select auth.uid())
    )
  );
