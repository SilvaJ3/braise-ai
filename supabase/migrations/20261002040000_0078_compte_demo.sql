-- 0078 — Le compte de démonstration : un drapeau distinct du compte de test (décision de JSB, 02/10/2026)
--
-- POURQUOI DEUX DRAPEAUX. JSB a nommé deux choses qui n'ont pas les mêmes conséquences :
--   · le COMPTE DE DÉMONSTRATION (« demo ») — l'outil qu'on montre à quelqu'un. Il garde l'accès, et
--     AUCUN de ses envois ne part vers un tiers : les destinataires d'une boutique sont remplacés par
--     l'adresse de son propriétaire, qui voit ainsi ce qui serait parti. C'est un environnement de
--     démonstration, pas un client.
--   · le COMPTE DE TEST (« est_test », 0075) — gratuit, marqué comme testeur, et destiné à devenir un
--     compte utilisateur. Ses mails partent normalement : un testeur qu'on rend muet croit l'app
--     cassée, et il ne peut plus devenir un utilisateur.
-- Jusqu'ici un seul drapeau portait les deux, et rien ne neutralisait les envois : il n'était lu qu'à
-- un endroit, `_shared/essai.ts` (la porte de l'accès).
--
-- Cette migration n'écrit AUCUNE donnée : le drapeau se pose compte par compte, avec l'accord de JSB.
-- Un `update` de compte est un geste, pas une migration.

alter table public.assistant_profil
  add column if not exists demo boolean not null default false;

comment on column public.assistant_profil.demo is
  'Compte de démonstration : accès ouvert, et aucun envoi ne part vers un tiers (les destinataires boutique sont remplacés par l''adresse du propriétaire du compte). Distinct de est_test, qui marque un compte de test destiné à devenir un utilisateur et qui, lui, envoie normalement.';

-- `comptes_admin()` rend le drapeau : l'écran doit dire « démonstration » là où il disait « compte de
-- test ». Le type de retour change, donc la fonction est retirée avant d'être recréée — et le `grant`
-- est reposé : un `drop function` emporte les droits, et l'écran répondrait « permission denied ».
drop function if exists public.comptes_admin(integer);

create or replace function public.comptes_admin(p_limite integer default 100)
returns table (
  user_id uuid,
  email text,
  plan text,
  abonnement_statut text,
  essai_fin timestamp with time zone,
  acces_gratuit boolean,
  acces_gratuit_depuis timestamp with time zone,
  est_test boolean,
  demo boolean,
  ouvert_le timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
begin
  if not public.est_admin() then
    raise exception 'acces_refuse' using errcode = '42501';
  end if;

  return query
    select p.user_id, u.email::text, p.plan, p.abonnement_statut, p.essai_fin,
           p.acces_gratuit, p.acces_gratuit_depuis, p.est_test, p.demo, u.created_at
      from public.assistant_profil p
      join auth.users u on u.id = p.user_id
     order by u.created_at desc
     limit v_limite;
end;
$function$;

grant execute on function public.comptes_admin(integer) to authenticated;
