-- 0066 — Le mail de présentation d'une boutique, et sa preuve.
--
-- Pourquoi une colonne, et rien de plus : la présentation d'une boutique doit partir UNE fois, et
-- cette preuve doit survivre à un redéploiement comme au renvoi d'un bon. `boutique_rappels` ne peut
-- pas la porter — sa contrainte n'accepte que 'rappel' et 'relance', et sa clé est mensuelle là où
-- une présentation n'a pas de mois. Une table entière pour une seule date serait une table de trop.
-- Elle vit donc sur le lien, là où vit déjà le jeton : le lien est ce qu'on présente.
--
-- Le geste d'envoi, lui, vit dans la fonction edge `depot`, au moment où le lien naît (premier bon).
-- Rien n'est armé ni planifié ici : la colonne ne fait que rendre l'envoi unique.

alter table public.boutique_liens
  add column if not exists presentation_envoyee_le timestamptz;

comment on column public.boutique_liens.presentation_envoyee_le is
  'Date à laquelle le mail de présentation est parti. Jamais réécrite : c''est la preuve d''un premier contact. Aucune policy — écrite par la fonction edge, en service_role (les rappels ont la même règle).';

-- --- Les liens qui existent déjà ---------------------------------------------------------------
-- Leurs boutiques ont reçu un bon, et le pied de ce bon portait déjà le lien et sa phrase : elles
-- ont vu l'outil. Leur envoyer aujourd'hui une présentation serait un mail de plus sur une relation
-- en route, et surtout laisser cette colonne à null ferait partir le rappel du 1er avant toute
-- présentation — exactement ce que la décision du 20/09/2026 écarte.
--
-- Inverser ce choix (ne rien marquer) est légitime : le bon suivant présentera la boutique. Il faut
-- alors décider ce qu'on fait des liens qui n'enverront plus de bon.
update public.boutique_liens
   set presentation_envoyee_le = cree_le
 where presentation_envoyee_le is null;

-- Ce qui reste à présenter, pour le vérifier avant d'armer les rappels :
-- select count(*) from public.boutique_liens where presentation_envoyee_le is null;
