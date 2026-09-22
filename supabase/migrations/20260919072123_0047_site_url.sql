-- Le site porte la page de validation d'une demande d'accès.
--
-- Pourquoi cette ligne existe : la page ne peut pas être servie par l'edge function — la
-- passerelle Supabase réécrit l'en-tête en `text/plain` et impose un CSP `sandbox`, donc le
-- navigateur affiche la source au lieu de la page (constaté en production le 19/09/2026). Elle
-- vit donc sur le site, et la fonction ne rend que des données.
--
-- `site_url` = la base du lien envoyé dans la notification à l'administrateur (`/acces?t=…`).
-- `app_url` reste la base du lien d'invitation envoyé à la personne (`/inscription?code=…`).

insert into public.reglages_produit (cle, valeur) values
  ('site_url', 'https://www.braaise.io')
on conflict (cle) do nothing;
