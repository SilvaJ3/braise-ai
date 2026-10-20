-- 0092 — Rendre les migrations fideles a la production : quatre objets qui n'existaient QUE dans
-- la base, jamais dans un fichier de migration.
--
-- Constat (lecture seule de la production, 21/10, API Management) :
--   · `boutique_historique(text, uuid)` est APPELEE par `boutique_compte_historique(uuid)`, que la
--     0067 cree et que le code de l'app appelle (`src/lib/compte-boutique.ts`) — mais aucune
--     migration ne la cree : sur une base reconstruite depuis le depot, l'historique partenaire
--     casse a l'appel.
--   · `boutique_invitations`, `boutique_artisans_invites()` et `boutique_creer_artisan()` sont une
--     fonctionnalite « la boutique invite ses artisans » presente en production (table vide,
--     0 ligne) et appelee par aucun code du depot.
--
-- Consequence mesuree : la production porte 44 tables dans `public`, les migrations n'en citaient
-- que 43. Cote fonctions : 81 en base, 71 citees par les migrations de CE depot — dont 7 qui
-- appartiennent au mini-CMS (creees dans son propre depot) et 3 qui sont a Braaise : celles-ci.
-- Cette migration retablit la fidelite.
-- Les definitions ci-dessous sont COPIEES MOT POUR MOT de `pg_get_functiondef` en production.
--
-- Divergence assumee et signalee : la production laisse sur la table les droits par defaut de
-- Supabase (anon + authenticated : tout), la RLS etant active SANS aucune politique (donc aucun
-- acces reel). Le depot, lui, suit sa convention d'hygiene (0080, 0086) et revoque ces droits :
-- la table reste inaccessible, la difference est cosmetique et volontaire.
--
-- Reste a trancher par JSB : finir ou supprimer la fonctionnalite d'invitation (table vide, aucun
-- appelant). Rien n'est supprime ici.

-- --- 1. La table d'invitations ------------------------------------------------------------------
create table if not exists public.boutique_invitations (
  id          uuid primary key default gen_random_uuid(),
  lien_id     uuid not null references public.boutique_liens(id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 6 and 254),
  atelier     text check (atelier is null or char_length(atelier) between 1 and 120),
  cree_le     timestamptz not null default now(),
  rattache_le timestamptz,
  unique (lien_id, email)
);

alter table public.boutique_invitations enable row level security;

revoke all on table public.boutique_invitations from anon, authenticated;

comment on table public.boutique_invitations is
  'Ce qu''une boutique a invité, et qui ne s''est pas encore rattaché.';

CREATE OR REPLACE FUNCTION public.boutique_artisans_invites()
 RETURNS TABLE(email text, atelier text, cree_le timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.email, i.atelier, i.cree_le
    from public.boutique_invitations i
   where i.lien_id = (select lien_id from public.boutique_compte_lien())
     and i.rattache_le is null
   order by i.cree_le;
$function$;

CREATE OR REPLACE FUNCTION public.boutique_creer_artisan(p_email text, p_atelier text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lien_id uuid;
  v_lien_email text;
  v_email text;
  v_user uuid;
  v_boutique uuid;
  v_nom text;
  v_atelier text;
begin
  select l.lien_id, l.email into v_lien_id, v_lien_email
    from public.boutique_compte_lien() l;
  if v_lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('erreur', 'email_invalide');
  end if;
  if v_email = lower(btrim(v_lien_email)) then
    return jsonb_build_object('erreur', 'email_est_le_tien');
  end if;

  v_atelier := nullif(btrim(coalesce(p_atelier, '')), '');

  -- L'artisan a-t-il déjà un compte ? Si oui, on le rattache tout de suite.
  select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;

  if v_user is not null then
    -- Sa boutique à lui, chez qui il dépose : la première, sinon on en crée une.
    select b.id, b.nom into v_boutique, v_nom
      from public.boutiques b
     where b.user_id = v_user
     order by b.created_at
     limit 1;

    if v_boutique is null then
      insert into public.boutiques (user_id, nom, email)
      values (v_user, coalesce(v_atelier, 'Mon atelier'), v_email)
      returning id, nom into v_boutique, v_nom;
    end if;

    insert into public.boutique_lien_partenaires (lien_id, user_id, boutique_id)
    values (v_lien_id, v_user, v_boutique)
    on conflict (user_id, boutique_id)
      do update set lien_id = excluded.lien_id, actif = true;

    insert into public.boutique_invitations (lien_id, email, atelier, rattache_le)
    values (v_lien_id, v_email, v_atelier, now())
    on conflict (lien_id, email) do update set rattache_le = now(), atelier = excluded.atelier;

    return jsonb_build_object(
      'ok', true, 'etat', 'rattache', 'artisan_id', v_user,
      'boutique', coalesce(v_atelier, v_nom));
  end if;

  -- Pas encore de compte : l'invitation attend son inscription.
  insert into public.boutique_invitations (lien_id, email, atelier)
  values (v_lien_id, v_email, v_atelier)
  on conflict (lien_id, email) do update set atelier = excluded.atelier;

  return jsonb_build_object('ok', true, 'etat', 'invite', 'email', v_email);
end;
$function$;

CREATE OR REPLACE FUNCTION public.boutique_historique(jeton_param text, partenaire_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lien uuid; v_user uuid; v_boutique uuid; v_histo jsonb;
begin
  select l.id into v_lien from public.boutique_liens l where l.jeton = jeton_param and l.actif;
  if v_lien is null then return jsonb_build_object('erreur', 'lien_invalide'); end if;

  select p.user_id, p.boutique_id into v_user, v_boutique
    from public.boutique_lien_partenaires p
   where p.id = partenaire_param and p.lien_id = v_lien and p.actif;
  if v_user is null then return jsonb_build_object('erreur', 'partenaire_inconnu'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'periode', dv.periode, 'declaration', dv.declare_le,
           'facturable', dv.total, 'statut', dv.statut, 'note', dv.note,
           'ventes', (select coalesce(sum((l->>'ventes')::numeric), 0)
                        from jsonb_array_elements(dv.lignes) l),
           'reprises', (select coalesce(sum((l->>'reprises')::numeric), 0)
                          from jsonb_array_elements(dv.lignes) l))
         order by dv.periode desc), '[]'::jsonb)
    into v_histo
    from (select * from public.declarations_ventes d
           where d.user_id = v_user and d.boutique_id = v_boutique
           order by d.periode desc limit 12) dv;

  return jsonb_build_object('ok', true, 'historique', v_histo);
end;
$function$;

revoke execute on function public.boutique_artisans_invites() from public, anon;
grant execute on function public.boutique_artisans_invites() to authenticated, service_role;

revoke execute on function public.boutique_creer_artisan(text, text) from public, anon;
grant execute on function public.boutique_creer_artisan(text, text) to authenticated, service_role;

-- La page boutique (sans connexion, jeton dans l'URL) appelle celle-ci avec la cle anon.
revoke execute on function public.boutique_historique(text, uuid) from public;
grant execute on function public.boutique_historique(text, uuid) to anon, authenticated, service_role;
