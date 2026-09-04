-- Archivage des bons de dépôt : masquer les vieux bons de la liste par défaut sans les
-- supprimer (document légal/contractuel signé, PDF archivé dans Storage). N'affecte ni le
-- statut ni la possibilité de modifier/renvoyer un brouillon archivé par erreur.
alter table public.depots
  add column archived_at timestamptz;

create index depots_user_archived_idx on public.depots (user_id, archived_at);
