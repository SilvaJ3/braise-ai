-- 0037 — Inscription sur invitation.
--
-- L'inscription publique est désactivée sur le projet (mesuré : `signup_disabled`). Plutôt que de
-- la rouvrir — ce qui laisserait n'importe qui créer un compte et consommer du LLM — les comptes
-- sont créés côté serveur par l'edge function `inscription`, qui exige un code d'invitation.
--
-- Le code vit ici, sans aucune policy : ni le client ni un compte connecté ne peuvent le lire, le
-- lister ou le deviner. Seul service_role (les edge functions) y touche.

create table public.invitations (
  code text primary key check (code = upper(code) and char_length(code) between 8 and 64),
  -- Adresse pré-attribuée : un code nominatif ne sert qu'à la personne visée. NULL = code ouvert.
  email text check (email is null or char_length(email) between 3 and 254),
  plan text not null default 'fondateur' check (char_length(plan) <= 40),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  reserved_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);

alter table public.invitations enable row level security;
-- Aucune policy, volontairement : service_role uniquement.

-- Réserver est un aller-retour : on marque le code AVANT de créer le compte, sinon deux
-- inscriptions simultanées passent avec le même code. La réservation expire d'elle-même au bout
-- de 10 minutes, pour qu'un isolat tué en plein travail ne brûle pas définitivement le code.

create or replace function public.invitation_reserver(p_code text, p_email text)
returns table (code text, plan text)
language sql
security definer
set search_path = ''
as $$
  update public.invitations i
     set reserved_at = now()
   where i.code = upper(trim(p_code))
     and i.used_at is null
     and (i.reserved_at is null or i.reserved_at < now() - interval '10 minutes')
     and i.expires_at > now()
     and (i.email is null or lower(i.email) = lower(trim(p_email)))
  returning i.code, i.plan;
$$;

revoke all on function public.invitation_reserver(text, text) from public, anon, authenticated;

create or replace function public.invitation_confirmer(p_code text, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invitations
     set used_at = now(), used_by = p_user, reserved_at = null
   where code = upper(trim(p_code)) and used_at is null;
$$;

revoke all on function public.invitation_confirmer(text, uuid) from public, anon, authenticated;

-- Libération : la création du compte a échoué, le code doit resservir tout de suite.
create or replace function public.invitation_liberer(p_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invitations set reserved_at = null
   where code = upper(trim(p_code)) and used_at is null;
$$;

revoke all on function public.invitation_liberer(text) from public, anon, authenticated;

-- Fabrique un code : 12 caractères en 3 groupes, alphabet sans I/O/0/1 (dicté au téléphone sans
-- ambiguïté), 31^12 combinaisons. Utilisable depuis l'éditeur SQL ou une migration.
create or replace function public.invitation_creer(
  p_note text default null,
  p_email text default null,
  p_plan text default 'fondateur',
  p_validite_jours int default 90
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
begin
  for essai in 1..50 loop
    v_code := '';
    for groupe in 1..3 loop
      for lettre in 1..4 loop
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      if groupe < 3 then
        v_code := v_code || '-';
      end if;
    end loop;
    begin
      insert into public.invitations (code, email, plan, note, expires_at)
      values (
        v_code,
        nullif(trim(coalesce(p_email, '')), ''),
        coalesce(nullif(trim(coalesce(p_plan, '')), ''), 'fondateur'),
        p_note,
        now() + make_interval(days => greatest(1, coalesce(p_validite_jours, 90)))
      );
      return v_code;
    exception when unique_violation then
      continue;
    end;
  end loop;
  raise exception 'aucun code libre trouvé après 50 essais';
end $$;

revoke all on function public.invitation_creer(text, text, text, int) from public, anon, authenticated;

-- Journal des tentatives d'inscription : borne le martèlement du point d'entrée (qui crée des
-- comptes, donc coûte), et donne la mesure de l'entonnoir pendant le pilote.
-- Purge à prévoir avec la rétention générale (voir app_events).

create table public.inscription_tentatives (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) <= 254),
  ip text check (ip is null or char_length(ip) <= 64),
  resultat text not null check (
    resultat in ('ok', 'code_inconnu', 'email_pris', 'email_invalide', 'mot_de_passe_faible', 'trop_de_tentatives', 'erreur')
  ),
  created_at timestamptz not null default now()
);

alter table public.inscription_tentatives enable row level security;
-- Aucune policy : service_role uniquement.

create index inscription_tentatives_heure_idx on public.inscription_tentatives (created_at desc);
create index inscription_tentatives_email_idx on public.inscription_tentatives (email, created_at desc);
