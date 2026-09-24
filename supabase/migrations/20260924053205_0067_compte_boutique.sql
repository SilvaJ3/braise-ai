-- 0067 — Le compte boutique : la boutique entre avec son identifiant à elle.
--
-- Jusqu'ici une boutique n'existait que par un lien : une adresse nominative, sans connexion.
-- Ce fichier ajoute la seconde moitié — un compte (adresse e-mail + mot de passe) rattaché à un
-- lien — et l'espace que la boutique voit une fois entrée : ses artisans, leurs dépôts, leurs
-- ventes, et les gestes qu'elle fait déjà depuis son lien (confirmer un bon, compter, demander un
-- réassort).
--
-- Ce qui compte ici, c'est ce qui n'est PAS dupliqué : chaque fonction ci-dessous retrouve le lien
-- à partir de `auth.uid()` et DÉLÈGUE aux fonctions publiques du lien (`boutique_etat`,
-- `boutique_declarer`, `boutique_commander`, `boutique_confirmer_bon`, `boutique_contester_bon`,
-- `boutique_historique`). Une seule implémentation du comptage, du réassort et de la confirmation :
-- le jour où le lien change, le compte change avec lui, et l'inverse. Deux écrans qui calculent
-- chacun de leur côté finissent toujours par se contredire.
--
-- Ce qui est fermé : aucune de ces fonctions ne prend d'identifiant venu de l'appelant — le lien,
-- l'artisan et la boutique sont retrouvés depuis le compte connecté. Elles ne sont données qu'à
-- `authenticated` (jamais à `anon`) : le lien reste la porte d'entrée sans compte, le compte est
-- celle qui demande un mot de passe.
--
-- Un seul lien par compte, et un seul compte par lien : l'administration multi-boutiques n'est pas
-- ouverte (décision du 24/09 — hors périmètre).

alter table public.boutique_liens
  add column if not exists compte_id uuid references auth.users(id) on delete set null,
  add column if not exists nom text
    check (nom is null or char_length(btrim(nom)) between 1 and 120);

-- Deux boutiques ne peuvent pas partager un compte, et un compte ne peut pas voir deux boutiques.
create unique index if not exists boutique_liens_compte_idx
  on public.boutique_liens (compte_id) where compte_id is not null;

comment on column public.boutique_liens.compte_id is
  'Le compte de la boutique : un utilisateur authentifié qui ouvre le même lien, avec mot de passe. Null tant que la boutique n''utilise que son lien.';
comment on column public.boutique_liens.nom is
  'Le nom que la boutique se donne (celui qu''elle voit en haut de son espace). À défaut, son adresse e-mail. Un compte peut être relié à plusieurs artisans qui la nomment différemment : c''est ce nom-ci qui s''affiche chez elle.';

-- --- Le lien du compte connecté ---------------------------------------------------------------
-- Fonction interne : elle rend le jeton, donc elle n'est donnée à personne. Les fonctions publiques
-- ci-dessous (security definer, exécutées par le propriétaire) l'appellent sans que le client y
-- ait accès.
create or replace function public.boutique_compte_lien()
returns table (lien_id uuid, jeton text, email text, nom text)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, l.jeton, l.email, l.nom
    from public.boutique_liens l
   where l.compte_id = auth.uid()
     and l.actif;
$$;

-- --- « Suis-je un compte boutique, et laquelle ? » --------------------------------------------
-- Sert à l'app pour ouvrir le bon espace après la connexion : un compte artisan reçoit
-- `pas_un_compte_boutique` et continue sa route. Aucune écriture.
create or replace function public.mon_compte_boutique()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
  v_nb int;
begin
  if auth.uid() is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;

  select * into v_lien from public.boutique_compte_lien();
  if v_lien.lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;

  select count(*) into v_nb
    from public.boutique_lien_partenaires p
   where p.lien_id = v_lien.lien_id and p.actif;

  return jsonb_build_object(
    'ok', true,
    'nom', coalesce(nullif(btrim(v_lien.nom), ''), v_lien.email),
    'email', v_lien.email,
    'fournisseurs', v_nb
  );
end;
$$;

-- --- L'état, exactement celui du lien ---------------------------------------------------------
create or replace function public.boutique_compte_etat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
  v_etat jsonb;
begin
  select * into v_lien from public.boutique_compte_lien();
  if v_lien.lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;

  v_etat := public.boutique_etat(v_lien.jeton);
  if v_etat ? 'erreur' then
    return v_etat;
  end if;
  return v_etat || jsonb_build_object('nom', coalesce(nullif(btrim(v_lien.nom), ''), v_lien.email));
end;
$$;

-- --- Ses dépôts : les bons que l'artisan lui a laissés ----------------------------------------
-- Ce que `boutique_etat` ne dit pas : elle ne montre que les bons EN ATTENTE de confirmation. Ici
-- c'est l'historique complet — ce qui est arrivé, quand, ce que ça vaut — confirmé ou pas.
create or replace function public.boutique_compte_bons(partenaire_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
  v_user uuid;
  v_boutique uuid;
  v_bons jsonb;
begin
  select * into v_lien from public.boutique_compte_lien();
  if v_lien.lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;

  -- Le couple est retrouvé à partir du lien : un partenaire d'un autre lien est refusé.
  select p.user_id, p.boutique_id into v_user, v_boutique
    from public.boutique_lien_partenaires p
   where p.id = partenaire_param and p.lien_id = v_lien.lien_id and p.actif;
  if v_user is null then
    return jsonb_build_object('erreur', 'partenaire_inconnu');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'bon_id', d.id,
           'numero', d.numero,
           'date', d.date_depot,
           'statut', d.statut,
           'confirme_le', d.confirme_le,
           'mode', d.mode,
           'pieces', (select coalesce(sum(l.quantite), 0)
                        from public.depot_lignes l where l.depot_id = d.id),
           'valeur', (select coalesce(sum(l.quantite * l.prix_unitaire), 0)
                        from public.depot_lignes l where l.depot_id = d.id),
           'lignes', (select coalesce(jsonb_agg(jsonb_build_object(
                        'designation', l.designation, 'quantite', l.quantite,
                        'prix', l.prix_unitaire) order by l.position), '[]'::jsonb)
                        from public.depot_lignes l where l.depot_id = d.id)
         ) order by d.date_depot desc, d.numero desc), '[]'::jsonb)
    into v_bons
    from public.depots d
   where d.user_id = v_user
     and d.boutique_id = v_boutique
     and d.archived_at is null
     and d.statut in ('envoye', 'signe');   -- un brouillon n'a jamais quitté l'atelier

  return jsonb_build_object('ok', true, 'bons', v_bons);
end;
$$;

-- --- Ses ventes : les relevés qu'elle a envoyés ------------------------------------------------
create or replace function public.boutique_compte_historique(partenaire_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
begin
  select * into v_lien from public.boutique_compte_lien();
  if v_lien.lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;
  return public.boutique_historique(v_lien.jeton, partenaire_param);
end;
$$;

-- --- Ses gestes : exactement ceux du lien ------------------------------------------------------
create or replace function public.boutique_compte_declarer(
  partenaire_param uuid,
  lignes_param jsonb,
  note_param text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
begin
  select * into v_lien from public.boutique_compte_lien();
  if v_lien.lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;
  return public.boutique_declarer(v_lien.jeton, partenaire_param, lignes_param, note_param);
end;
$$;

create or replace function public.boutique_compte_commander(
  partenaire_param uuid,
  lignes_param jsonb,
  note_param text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
begin
  select * into v_lien from public.boutique_compte_lien();
  if v_lien.lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;
  return public.boutique_commander(v_lien.jeton, partenaire_param, lignes_param, note_param);
end;
$$;

create or replace function public.boutique_compte_confirmer_bon(bon_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
begin
  select * into v_lien from public.boutique_compte_lien();
  if v_lien.lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;
  return public.boutique_confirmer_bon(v_lien.jeton, bon_param);
end;
$$;

create or replace function public.boutique_compte_contester_bon(
  bon_param uuid,
  message_param text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
begin
  select * into v_lien from public.boutique_compte_lien();
  if v_lien.lien_id is null then
    return jsonb_build_object('erreur', 'pas_un_compte_boutique');
  end if;
  return public.boutique_contester_bon(v_lien.jeton, bon_param, message_param);
end;
$$;

-- --- Droits ------------------------------------------------------------------------------------
-- Le lien reste la porte d'entrée sans compte : ces fonctions-ci ne sont données qu'à
-- `authenticated` — un visiteur anonyme ne peut pas les appeler.
--
-- Les deux `revoke` sont nécessaires : `public` ne suffit pas ici, la base accorde EXECUTE à `anon`
-- et `authenticated` par défaut sur toute fonction créée dans `public` (ALTER DEFAULT PRIVILEGES
-- de Supabase). Constaté au `proacl` après la première écriture : `anon=X` y figurait encore.
revoke all on function public.boutique_compte_lien() from public, anon;
revoke all on function public.mon_compte_boutique() from public, anon;
revoke all on function public.boutique_compte_etat() from public, anon;
revoke all on function public.boutique_compte_bons(uuid) from public, anon;
revoke all on function public.boutique_compte_historique(uuid) from public, anon;
revoke all on function public.boutique_compte_declarer(uuid, jsonb, text) from public, anon;
revoke all on function public.boutique_compte_commander(uuid, jsonb, text) from public, anon;
revoke all on function public.boutique_compte_confirmer_bon(uuid) from public, anon;
revoke all on function public.boutique_compte_contester_bon(uuid, text) from public, anon;

grant execute on function public.mon_compte_boutique() to authenticated;
grant execute on function public.boutique_compte_etat() to authenticated;
grant execute on function public.boutique_compte_bons(uuid) to authenticated;
grant execute on function public.boutique_compte_historique(uuid) to authenticated;
grant execute on function public.boutique_compte_declarer(uuid, jsonb, text) to authenticated;
grant execute on function public.boutique_compte_commander(uuid, jsonb, text) to authenticated;
grant execute on function public.boutique_compte_confirmer_bon(uuid) to authenticated;
grant execute on function public.boutique_compte_contester_bon(uuid, text) to authenticated;
