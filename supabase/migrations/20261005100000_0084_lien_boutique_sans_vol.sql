-- 0084 — Un artisan ne peut plus se faire remettre le lien d'une boutique qui n'est pas la sienne.
--
-- Le trou (audit du 05/10/2026) : l'identité d'un lien est l'adresse mail de la boutique, et cette
-- adresse est écrite librement par l'artisan sur sa fiche (`boutiques.email`, policy « own rows »).
-- `mon_lien_boutique` retrouvait le lien EXISTANT de cette adresse, y rattachait l'appelant et lui
-- rendait le jeton : il suffisait de saisir l'adresse de Lära sur une fiche pour recevoir son jeton,
-- donc l'état, les prix et les bons de tous ses artisans — et pouvoir agir à leur place.
--
-- La règle, maintenant : côté artisan (`mon_lien_boutique`), un lien qui existe déjà n'est rendu
-- qu'à un artisan qui y est DÉJÀ rattaché. Sinon, `lien_existant`, sans jeton et sans rattachement.
-- Le rattachement d'un nouvel artisan passe par la seule preuve qui tienne : le mail du bon part à
-- l'adresse de la boutique, et c'est elle seule qui reçoit le lien (chemin `depot`, service_role,
-- inchangé : le paramètre vaut `true` par défaut).
--
-- `lien_boutique_assurer` change de signature (un 3e paramètre à défaut) : on retire l'ancienne,
-- sinon un appel à deux arguments serait ambigu entre les deux.

drop function if exists public.lien_boutique_assurer(uuid, uuid);

create or replace function public.lien_boutique_assurer(
  p_user uuid,
  p_boutique uuid,
  p_lien_existant_ok boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nom text;
  v_lien uuid;
  v_jeton text;
begin
  if p_user is null or p_boutique is null then
    return jsonb_build_object('erreur', 'parametre_manquant');
  end if;

  select lower(btrim(b.email)), b.nom into v_email, v_nom
    from public.boutiques b
   where b.id = p_boutique and b.user_id = p_user;

  if v_email is null or v_email = '' then
    -- À défaut d'adresse sur la fiche, on prend celle à laquelle ses bons sont partis : c'est la
    -- même boutique, et l'artisan n'a rien à ressaisir.
    select lower(btrim(coalesce(nullif(d.boutique_email, ''), d.email_to[1])))
      into v_email
      from public.depots d
     where d.user_id = p_user
       and d.boutique_id = p_boutique
       and (coalesce(d.boutique_email, '') <> '' or coalesce(array_length(d.email_to, 1), 0) > 0)
     order by d.date_depot desc
     limit 1;
  end if;

  if v_email is null or v_email = '' then
    return jsonb_build_object('erreur', 'boutique_sans_email');
  end if;

  select id, jeton into v_lien, v_jeton from public.boutique_liens where email = v_email;

  if v_lien is not null and not p_lien_existant_ok
     and not exists (select 1 from public.boutique_lien_partenaires p
                      where p.lien_id = v_lien and p.user_id = p_user
                        and p.boutique_id = p_boutique and p.actif) then
    return jsonb_build_object('erreur', 'lien_existant');
  end if;

  if v_lien is null then
    v_jeton := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.boutique_liens (email, jeton) values (v_email, v_jeton) returning id into v_lien;
  end if;

  insert into public.boutique_lien_partenaires (lien_id, user_id, boutique_id)
  values (v_lien, p_user, p_boutique)
  on conflict (user_id, boutique_id) do update set lien_id = excluded.lien_id, actif = true;

  return jsonb_build_object('ok', true, 'jeton', v_jeton, 'boutique', v_nom, 'email', v_email);
end;
$$;

-- Côté artisan : l'artisan vient de sa session, jamais d'un paramètre, et un lien déjà existant
-- ne lui est pas remis s'il n'y est pas rattaché.
create or replace function public.mon_lien_boutique(boutique_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;
  return public.lien_boutique_assurer(v_user, boutique_param, false);
end;
$$;

revoke all on function public.lien_boutique_assurer(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.lien_boutique_assurer(uuid, uuid, boolean) to service_role;

revoke all on function public.mon_lien_boutique(uuid) from public, anon;
grant execute on function public.mon_lien_boutique(uuid) to authenticated;
