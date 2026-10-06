-- La déclaration d'usage professionnel remplace la renonciation au droit de rétractation.
-- Braaise s'adresse aux professionnels : on constate la qualité du souscripteur au lieu de lui
-- faire abandonner un droit que la loi réserve au consommateur (art. VI.47 CDE).
--
-- On AJOUTE la nouvelle colonne et on garde l'ancienne : son contenu est une preuve datée, on ne
-- l'efface pas. L'ancienne n'est plus écrite par le code de paiement.

alter table public.assistant_profil
  add column if not exists usage_professionnel_declare_le timestamptz;

comment on column public.assistant_profil.usage_professionnel_declare_le is
  'Date à laquelle le souscripteur a déclaré agir pour les besoins de son activité professionnelle (art. VI.47 CDE : le droit de rétractation ne s''applique pas entre professionnels).';

comment on column public.assistant_profil.retractation_renoncee_le is
  'OBSOLÈTE — renonciation au droit de rétractation, écrite avant le 06/10/2026. Conservée comme preuve historique : elle n''est plus alimentée.';
