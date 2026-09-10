-- Photo du dépôt : cliché de l'état des articles au moment du dépôt, à côté de la signature.
-- Même logique que signature_image (JPEG base64 embarqué directement dans le PDF), plafond
-- plus large car une photo pèse davantage qu'un tracé : compressée côté client (~200-400 Ko
-- en pratique), plafonnée à 2 Mo pour garder de la marge.
alter table public.depots
  add column photo_image text check (photo_image is null or char_length(photo_image) <= 2000000);
