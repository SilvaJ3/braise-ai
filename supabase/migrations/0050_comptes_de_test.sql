-- 0050 — Distinguer les comptes de test des vrais comptes.
--
-- Pendant la construction, des comptes servent à essayer : ils consomment du quota, faussent les
-- compteurs, et n'ont rien à faire dans un chiffre d'activité. Ce drapeau les marque une fois pour
-- toutes, sans les supprimer — un compte de test garde ses données, il est seulement identifiable.
--
-- Par défaut à `false` : un compte réel ouvert par invitation n'est jamais marqué par erreur.

alter table public.assistant_profil
  add column if not exists est_test boolean not null default false;

comment on column public.assistant_profil.est_test is
  'Compte de démonstration ou d''essai technique : exclu des comptages d''activité.';

-- Les comptes déjà connus comme étant des essais : le compte de test historique et celui de
-- démonstration du propriétaire. On ne devine pas — on les nomme.
update public.assistant_profil p
   set est_test = true
 where exists (
   select 1 from auth.users u
    where u.id = p.user_id
      and (u.email like '%+demo@%' or u.email like '%+stripe@%' or u.email like '%+test@%')
 );
