-- Coordonnées de la personne pour une commande hors dépôt-vente : utile pour la relance /
-- la remise en main propre, sans dupliquer un vrai CRM (pas de table à part, juste 2 colonnes).
alter table public.commandes
  add column client_telephone text check (client_telephone is null or char_length(client_telephone) <= 50),
  add column client_email text check (client_email is null or char_length(client_email) <= 200);
