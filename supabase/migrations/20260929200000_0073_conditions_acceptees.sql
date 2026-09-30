-- L'acceptation des conditions, datée sur le compte.
--
--   conditions_acceptees_le — l'horodatage du clic sur « j'accepte », au moment de l'inscription.
--   Colonne ajoutée plutôt que table à part : c'est une propriété du compte, comme
--   `onboarding_completed_at`, et une table de plus pour une seule date ne se justifie pas.
--
--   Nullable, et c'est voulu : les comptes créés avant cette migration n'ont rien accepté, et
--   prétendre le contraire serait faux. Un compte ancien reste donc à `null` — l'avancement se
--   lit dans la donnée, jamais dans une supposition.
--
--   L'acceptation est écrite par l'edge function `inscription` avec la clé de service, jamais par
--   le client : une case à cocher que le client peut écrire lui-même ne vaut pas mieux que pas de
--   case du tout.
--
-- Réexécutable : `add column if not exists`, et le bloc `do` ne retouche la contrainte que si elle
-- ne connaît pas encore la valeur neuve.

alter table public.assistant_profil
  add column if not exists conditions_acceptees_le timestamptz;

comment on column public.assistant_profil.conditions_acceptees_le is
  'Date d''acceptation des conditions générales et de la politique de confidentialité, écrite par l''edge function inscription. Nulle pour les comptes créés avant la migration.';

-- La contrainte de `inscription_tentatives.resultat` est une liste fermée : un refus dû à une case
-- décochée s'y journalise comme les autres, donc la liste doit l'accueillir. Sans ça, la
-- journalisation échouerait en silence (elle ne fait jamais échouer l'inscription) et le motif
-- disparaîtrait du journal au moment précis où on le cherche.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'inscription_tentatives_resultat_check'
       and conrelid = 'public.inscription_tentatives'::regclass
       and pg_get_constraintdef(oid) like '%sans_conditions%'
  ) then
    alter table public.inscription_tentatives
      drop constraint if exists inscription_tentatives_resultat_check;
    alter table public.inscription_tentatives
      add constraint inscription_tentatives_resultat_check
      check (resultat = any (array[
        'ok', 'code_inconnu', 'email_pris', 'email_invalide', 'mot_de_passe_faible',
        'sans_conditions', 'trop_de_tentatives', 'erreur'
      ]));
  end if;
end $$;
