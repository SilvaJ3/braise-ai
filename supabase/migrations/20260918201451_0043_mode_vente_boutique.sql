-- 0043 — Mode de vente par boutique : dépôt-vente ou achat ferme.
--
-- Le bon de dépôt ne disait rien de la règle commerciale : le même document servait au
-- dépôt-vente (les articles restent à l'artisan, il ne facture que ce qui est vendu) et à
-- l'achat ferme (la boutique achète à la remise), avec un « Total (prix de vente TTC) » qui se
-- lit comme une valeur indicative dans un cas et comme un montant dû dans l'autre. La seule
-- mention possible était `profil_entreprise.mention_signature`, unique pour tout le compte et
-- donc la même pour toutes les boutiques.
--
-- Sur les fiches réelles : 3 boutiques en dépôt-vente, 1 en achat ferme (« Haut les Cœurs ») —
-- c'est cette dernière qui recevait un « Bon de dépôt » alors qu'elle achète ferme.

alter table public.boutiques
  add column mode text not null default 'depot_vente'
    check (mode in ('depot_vente', 'achat_ferme'));

-- Figé sur le bon à l'émission : le bon est une pièce contractuelle, son sens ne doit pas
-- changer si la fiche boutique change plus tard (même logique que 0029 pour la numérotation).
-- Les bons déjà émis gardent le défaut, qui est ce qu'ils disent aujourd'hui.
alter table public.depots
  add column mode text not null default 'depot_vente'
    check (mode in ('depot_vente', 'achat_ferme'));
