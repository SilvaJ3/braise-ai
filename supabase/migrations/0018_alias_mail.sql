-- Adresse d'expédition des bons de dépôt.
-- Les mails partent du domaine de l'application (service mail propre à l'app), avec une
-- adresse par compte dérivée du nom commercial : « Au Coin du Feu » → aucoindufeu@braise.io.
-- L'utilisateur n'a donc aucun réglage technique à faire ; les réponses des boutiques lui
-- reviennent via Reply-To (colonne `email` de profil_entreprise).

alter table public.profil_entreprise
  add column alias_mail text
  check (alias_mail is null or alias_mail ~ '^[a-z0-9][a-z0-9-]{0,49}$');

-- Deux comptes ne peuvent pas partager la même adresse d'expédition.
create unique index profil_entreprise_alias_mail_idx
  on public.profil_entreprise (alias_mail)
  where alias_mail is not null;
