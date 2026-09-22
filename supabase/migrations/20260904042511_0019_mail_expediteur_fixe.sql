-- Simplification : tous les bons partent de no-reply@<domaine>, une adresse fixe pour
-- l'ensemble de l'app plutôt qu'un alias dérivé du nom par compte (0018). L'identité de
-- l'expéditeur reste le nom commercial affiché, les réponses reviennent via Reply-To.
alter table public.profil_entreprise drop column if exists alias_mail;
