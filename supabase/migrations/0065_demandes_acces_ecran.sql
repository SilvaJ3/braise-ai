-- L'écran « Demandes d'accès » — traiter une demande sans passer par le mail.
--
-- Jusqu'ici, une demande reçue du site ne se traitait que par le lien envoyé à l'administrateur
-- (migration 0045) : le mail perdu, ou classé, la demande restait « nouvelle » pour toujours. Le
-- 21/09, deux demandes réelles dormaient dans la table depuis le 19/09 — exactement ce cas-là.
--
-- `demandes_acces` n'est lisible qu'en service_role (aucune policy, volontairement) : l'écran
-- ouvre donc une lecture nominative, réservée aux comptes d'administration, et rien d'autre.
--
-- Deux portes, une seule règle : `est_admin()` est le seul juge, et la liste ne sort que par une
-- fonction security definer. **Aucune policy d'écriture n'est ajoutée** : la validation continue
-- de passer par l'edge function `demande-acces`, seul chemin qui sait créer l'invitation
-- nominative, appliquer le plafond des places de fondateur et envoyer le lien. L'écran ne fait
-- que rendre le geste accessible ; il n'ouvre pas un second chemin d'écriture.

create table if not exists public.admin_comptes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text check (note is null or char_length(note) between 1 and 200),
  ajoute_le timestamptz not null default now()
);

alter table public.admin_comptes enable row level security;
-- Aucune policy, volontairement : on y écrit en SQL (service_role), jamais depuis le client.

-- Le seul juge de qui administre. `security definer` parce que la table n'est lisible par
-- personne d'autre ; la fonction ne rend qu'un booléen, jamais une ligne.
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_comptes a where a.user_id = (select auth.uid())
  )
$$;

revoke all on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated;

-- La liste pour l'écran. Le jeton y figure, et c'est voulu : il est la capacité de valider, et il
-- n'est rendu qu'à un administrateur — c'est la même capacité que celle du lien reçu par mail,
-- sans dépendre de la boîte. Une demande déjà traitée n'a plus de jeton : la trace reste, la
-- capacité disparaît.
--
-- La limite est bornée dans la fonction : un écran ne doit pas pouvoir demander la table entière.
create or replace function public.demandes_acces_admin(p_limite integer default 50)
returns table (
  id uuid,
  email text,
  atelier text,
  message text,
  statut text,
  jeton text,
  created_at timestamptz,
  traitee_at timestamptz,
  invitation_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
begin
  if not public.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  return query
    select d.id, d.email, d.atelier, d.message, d.statut, d.jeton,
           d.created_at, d.traitee_at, d.invitation_code
      from public.demandes_acces d
     order by d.created_at desc
     limit v_limite;
end;
$$;

revoke all on function public.demandes_acces_admin(integer) from public, anon;
grant execute on function public.demandes_acces_admin(integer) to authenticated;
