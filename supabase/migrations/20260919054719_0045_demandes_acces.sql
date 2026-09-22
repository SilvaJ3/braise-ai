-- Demandes d'accès venues du site — le haut de l'entonnoir.
--
-- Le site présente le produit et ne porte qu'un seul formulaire : « demande ton accès ». La
-- demande arrive ici, mais elle ne crée **rien** toute seule : une notification part vers
-- l'adresse d'administration avec un jeton de validation à usage unique, et l'invitation n'est
-- créée que lorsque l'administrateur clique. Un formulaire public ne peut donc pas fabriquer
-- d'invitations, seulement proposer un nom.
--
-- Pourquoi un jeton plutôt qu'un lien qui agit tout seul : les boîtes mail (et les antivirus)
-- ouvrent parfois les liens d'un message avant l'humain. Un lien qui crée une invitation au
-- chargement enverrait des invitations sans que personne ne l'ait voulu. Ici le lien n'ouvre
-- qu'une page de confirmation ; c'est le clic sur le bouton qui agit.
--
-- Le jeton est effacé dès qu'il a servi : un lien de mail qui traînerait ne vaut plus rien.

create table public.demandes_acces (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) between 6 and 254),
  atelier text check (atelier is null or char_length(atelier) between 1 and 120),
  message text check (message is null or char_length(message) between 1 and 600),
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'validee', 'refusee')),
  -- Jeton de validation, envoyé par mail à l'administrateur. NULL = déjà traité.
  jeton text check (jeton is null or char_length(jeton) between 16 and 64),
  invitation_code text references public.invitations(code) on delete set null,
  ip text check (ip is null or char_length(ip) <= 64),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  traitee_at timestamptz
);

create index demandes_acces_journal_idx on public.demandes_acces (created_at desc);
create index demandes_acces_email_idx on public.demandes_acces (email);
-- Le jeton est unique quand il existe : deux demandes ne peuvent pas porter le même.
create unique index demandes_acces_jeton_idx on public.demandes_acces (jeton) where jeton is not null;

alter table public.demandes_acces enable row level security;
-- Aucune policy, volontairement : service_role uniquement. La liste des demandeurs n'a rien à
-- faire dans le client, et l'entête d'administration n'est pas construit (voir ROADMAP).

-- Sert à ne pas inviter quelqu'un qui a déjà un compte : l'email vit dans `auth.users`, que
-- PostgREST n'expose pas. security definer + service_role uniquement.
create or replace function public.compte_existe(p_email text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email))
$$;

revoke all on function public.compte_existe(text) from public, anon, authenticated;
