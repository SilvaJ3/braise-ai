-- 0081 — Rattacher un compte à un lien boutique par une FONCTION, plus à la main en SQL.
--
-- Constat : `boutique_liens.compte_id` n'est posé par aucun code (0067 ne fait que le définir). Le
-- compte de Lära et la « Boutique d'essai » ont été reliés à la main. Ici, deux fonctions réservées
-- à l'administration (clé de service) : aucun client, aucun jeton de lien, aucune API publique.
--
-- Garde-fous : un lien n'a qu'un compte, un compte n'a qu'un lien (l'index unique de 0067 le dit déjà ;
-- la fonction répond proprement avant qu'il ne casse), le compte doit exister, rien n'est écrasé.
-- Le jeton de lien reste une porte sans compte : le détacher ne le touche pas.

create function public.rattacher_compte_boutique(p_lien uuid, p_compte uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lien record;
  v_email_compte text;
begin
  select l.id, l.email, l.compte_id into v_lien
    from public.boutique_liens l where l.id = p_lien for update;
  if not found then return jsonb_build_object('erreur', 'lien_inconnu'); end if;

  select u.email into v_email_compte from auth.users u where u.id = p_compte;
  if v_email_compte is null then return jsonb_build_object('erreur', 'compte_inconnu'); end if;

  if v_lien.compte_id is not null then
    return jsonb_build_object('erreur',
      case when v_lien.compte_id = p_compte then 'deja_rattache' else 'lien_deja_rattache' end);
  end if;
  if exists (select 1 from public.boutique_liens x where x.compte_id = p_compte) then
    return jsonb_build_object('erreur', 'compte_deja_rattache');
  end if;

  update public.boutique_liens set compte_id = p_compte where id = p_lien;

  -- Une adresse de compte différente de celle du lien est permise (la boutique peut s'écrire d'ailleurs) :
  -- on le DIT, on ne le refuse pas.
  return jsonb_build_object('ok', true, 'lien', p_lien, 'compte', p_compte,
    'email_identique', lower(btrim(v_lien.email)) = lower(btrim(v_email_compte)));
end;
$$;

create function public.detacher_compte_boutique(p_lien uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.boutique_liens set compte_id = null where id = p_lien and compte_id is not null;
  if not found then return jsonb_build_object('erreur', 'rien_a_detacher'); end if;
  return jsonb_build_object('ok', true, 'lien', p_lien);
end;
$$;

-- Fonctions d'administration : clé de service seulement. Le `revoke` est explicite, car Supabase accorde
-- EXECUTE à `anon` et `authenticated` à toute fonction créée dans `public` (0067, 0070).
revoke all on function public.rattacher_compte_boutique(uuid, uuid) from public, anon, authenticated;
revoke all on function public.detacher_compte_boutique(uuid) from public, anon, authenticated;
grant execute on function public.rattacher_compte_boutique(uuid, uuid) to service_role;
grant execute on function public.detacher_compte_boutique(uuid) to service_role;
