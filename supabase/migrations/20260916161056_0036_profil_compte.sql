-- 0036 — Le compte cesse d'être celui d'Alexandra : profil structuré et état d'onboarding.
--
-- Jusqu'ici `assistant_profil` ne portait qu'un texte libre (la « voix de marque »), et le profil
-- de secours de l'assistant était codé en dur dans l'edge function : « Tu assistes Alexandra,
-- artisane qui fabrique des bougies ». Un artisan qui s'inscrivait recevait donc la voix de marque
-- de quelqu'un d'autre, et l'assistant lui parlait de bougies.
--
-- On ajoute ici ce que l'onboarding va recueillir (activité, nom commercial, lieu) et la date de
-- fin d'onboarding, qui sert de porte d'entrée : tant qu'elle est nulle, l'app mène au tunnel.

alter table public.assistant_profil
  add column if not exists metier text,
  add column if not exists nom_commercial text,
  add column if not exists ville text,
  add column if not exists pays text not null default 'Belgique',
  add column if not exists onboarding_completed_at timestamptz;

-- Bornes, comme partout ailleurs dans le schéma : ces champs partent dans le prompt du modèle.
alter table public.assistant_profil
  add constraint assistant_profil_metier_len check (metier is null or char_length(metier) <= 80),
  add constraint assistant_profil_nom_len check (nom_commercial is null or char_length(nom_commercial) <= 80),
  add constraint assistant_profil_ville_len check (ville is null or char_length(ville) <= 80),
  add constraint assistant_profil_pays_len check (char_length(pays) between 2 and 60);

-- Les comptes ouverts avant cette migration ne passent pas par l'onboarding : ils ont déjà leur
-- profil, leurs produits et leurs données. On marque la ligne comme terminée, et on la crée si
-- elle n'existe pas (un compte sans ligne de profil ne doit pas non plus être renvoyé au tunnel).

insert into public.assistant_profil (user_id, onboarding_completed_at)
select id, now() from auth.users
on conflict (user_id) do update set onboarding_completed_at = now()
where public.assistant_profil.onboarding_completed_at is null;
