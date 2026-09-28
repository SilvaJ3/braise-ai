-- 0071 — Les catégories de matières premières deviennent génériques.
--
-- « cire », « meche », « parfum », « colorant » décrivaient le métier du premier compte
-- (un atelier de bougies). L'inventaire et l'import doivent valoir pour tous les métiers :
-- six catégories neutres, et les mots d'atelier deviennent des synonymes côté import
-- (voir `supabase/functions/_shared/import-entities.ts`).
--
-- Ré-exécutable : `drop constraint if exists`, `update` borné aux anciennes valeurs.

alter table public.matieres_premieres
  drop constraint if exists matieres_premieres_categorie_check;

update public.matieres_premieres
  set categorie = case categorie
    when 'cire' then 'matiere'
    when 'meche' then 'finition'
    when 'parfum' then 'finition'
    when 'colorant' then 'finition'
    when 'contenant' then 'contenant'
    when 'emballage' then 'emballage'
    else categorie
  end
  where categorie in ('cire', 'meche', 'parfum', 'colorant');

alter table public.matieres_premieres
  add constraint matieres_premieres_categorie_check
  check (
    categorie is null
    or categorie in ('matiere', 'contenant', 'emballage', 'finition', 'consommable', 'autre')
  );
