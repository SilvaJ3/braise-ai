-- 0038 — Ce que le tunnel d'accueil recueille : canaux de vente et plateformes.
--
-- L'assistant conseille mieux s'il sait où la personne vend : proposer un Reel Instagram à
-- quelqu'un qui ne vit que des marchés, c'est du travail en plus pour rien. Ces deux colonnes
-- portent la réponse, et les contraintes refusent une valeur inventée : la liste est fermée ici,
-- pas seulement dans l'interface.

alter table public.assistant_profil
  add column if not exists canaux text[] not null default '{}',
  add column if not exists plateformes text[] not null default '{}';

alter table public.assistant_profil
  add constraint assistant_profil_canaux_valides
    check (canaux <@ array['reseaux', 'marches', 'boutiques', 'en_ligne']::text[]),
  add constraint assistant_profil_plateformes_valides
    check (plateformes <@ array['instagram', 'facebook', 'tiktok']::text[]);
