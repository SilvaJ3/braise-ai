-- 0052 — Le lien appartient à la BOUTIQUE, pas au couple artisan ↔ boutique.
--
-- Une boutique travaille avec plusieurs artisans. Un lien par artisan l'obligerait à jongler entre
-- plusieurs adresses : un seul lien, et la liste de ses artisans partenaires à l'intérieur.
-- Conséquence commerciale : une boutique déjà équipée devient une porte d'entrée — un artisan qui
-- la déclare comme point de vente rejoint un lien qui existe déjà, sans rien à créer.
--
-- L'identité d'une boutique, d'un artisan à l'autre, est son adresse e-mail : c'est déjà par là que
-- les bons partent. Deux artisans qui enregistrent la même adresse alimentent le même lien.
--
-- Ce qui reste strictement cloisonné : la boutique ne voit que les couples (artisan, boutique) qui
-- lui sont rattachés. Ni les autres boutiques d'un artisan, ni les clients de qui que ce soit.
--
-- Le partenaire visé par un appel est TOUJOURS retrouvé à partir du jeton (partenaire_param doit
-- appartenir au lien) : un identifiant venu de l'appelant ne donne jamais accès à un couple.

drop function if exists public.boutique_etat(text);
drop function if exists public.boutique_declarer(text, jsonb, text);
drop function if exists public.boutique_commander(text, jsonb, text);
drop table if exists public.declarations_ventes;
drop table if exists public.boutique_lien_partenaires;
drop table if exists public.boutique_liens;

-- --- Les liens, un par boutique (identifiée par son adresse) ---------------------------------
create table public.boutique_liens (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) between 3 and 320),
  jeton text not null unique check (char_length(jeton) between 32 and 80),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  dernier_acces timestamptz
);

-- --- Les couples (artisan, boutique) rattachés à un lien -------------------------------------
create table public.boutique_lien_partenaires (
  id uuid primary key default gen_random_uuid(),
  lien_id uuid not null references public.boutique_liens(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  unique (lien_id, boutique_id),
  unique (user_id, boutique_id)
);

alter table public.boutique_liens enable row level security;
alter table public.boutique_lien_partenaires enable row level security;

-- L'artisane voit et gère ses propres rattachements. Le lien lui-même appartient à la boutique :
-- elle n'y accède que par la fonction dédiée, qui vérifie qu'elle possède la boutique.
create policy "partenaires: own rows" on public.boutique_lien_partenaires
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- --- Les déclarations de ventes de la boutique ------------------------------------------------
create table public.declarations_ventes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  periode date not null,                     -- premier jour du mois déclaré
  lignes jsonb not null,                     -- [{cle, produit_id, designation, quantite, prix_unitaire, alerte}]
  total numeric(10,2) not null default 0,
  note text check (note is null or char_length(note) <= 2000),
  declare_le timestamptz not null default now(),
  statut text not null default 'declaree' check (statut in ('declaree', 'validee', 'corrigee')),
  unique (user_id, boutique_id, periode)
);

alter table public.declarations_ventes enable row level security;
create policy "declarations_ventes: own rows" on public.declarations_ventes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index declarations_ventes_couple_idx
  on public.declarations_ventes (user_id, boutique_id, periode desc);

-- --- Côté artisane : obtenir (ou créer) le lien de sa boutique --------------------------------
create or replace function public.mon_lien_boutique(boutique_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_nom text;
  v_lien uuid;
  v_jeton text;
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;

  select lower(btrim(b.email)), b.nom into v_email, v_nom
    from public.boutiques b
   where b.id = boutique_param and b.user_id = v_user;

  if v_email is null or v_email = '' then
    -- À défaut d'adresse sur la fiche, on prend celle à laquelle ses bons sont partis : c'est la
    -- même boutique, et l'artisane n'a rien à ressaisir. (Vu sur les données réelles : 5 fiches
    -- sur 6 portent une adresse, Lära Concept Store non — mais ses bons sont partis à
    -- info@laraconceptstore.be.)
    select lower(btrim(coalesce(nullif(d.boutique_email, ''), d.email_to[1])))
      into v_email
      from public.depots d
     where d.user_id = v_user
       and d.boutique_id = boutique_param
       and (coalesce(d.boutique_email, '') <> '' or coalesce(array_length(d.email_to, 1), 0) > 0)
     order by d.date_depot desc
     limit 1;
  end if;

  if v_email is null or v_email = '' then
    return jsonb_build_object('erreur', 'boutique_sans_email');
  end if;

  select id, jeton into v_lien, v_jeton from public.boutique_liens where email = v_email;
  if v_lien is null then
    v_jeton := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.boutique_liens (email, jeton) values (v_email, v_jeton) returning id into v_lien;
  end if;

  insert into public.boutique_lien_partenaires (lien_id, user_id, boutique_id)
  values (v_lien, v_user, boutique_param)
  on conflict (user_id, boutique_id) do update set lien_id = excluded.lien_id, actif = true;

  return jsonb_build_object('ok', true, 'jeton', v_jeton, 'boutique', v_nom, 'email', v_email);
end;
$$;

-- --- Côté boutique : tout ce qu'elle voit, en un seul appel -----------------------------------
create or replace function public.boutique_etat(jeton_param text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lien record;
  v_periode date := date_trunc('month', current_date)::date;
  v_partenaires jsonb;
begin
  select l.id, l.email into v_lien
    from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;

  if v_lien.id is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;

  update public.boutique_liens set dernier_acces = now() where id = v_lien.id;

  with paires as (
    select p.id as partenaire_id, p.user_id, p.boutique_id,
           coalesce(pe.nom, '') as artisan,
           coalesce(pe.delai_semaines, 2) as delai,
           (select b.nom from public.boutiques b where b.id = p.boutique_id) as boutique
      from public.boutique_lien_partenaires p
      left join public.profil_entreprise pe on pe.user_id = p.user_id
     where p.lien_id = v_lien.id and p.actif
  ), depose as (
    select p.partenaire_id, DUCLE as cle, dl.produit_id,
           max(dl.designation) as designation,
           sum(dl.quantite) as quantite,
           max(dl.prix_unitaire) as prix,
           max(d.date_depot) as dernier_depot
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null
     group by p.partenaire_id, DUCLE, dl.produit_id
  ), vendu as (
    select p.partenaire_id, (ligne->>'cle') as cle,
           sum((ligne->>'quantite')::numeric) as quantite
      from paires p
      join public.declarations_ventes dv
        on dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
      cross join lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.statut <> 'corrigee'
     group by p.partenaire_id, 2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'partenaire_id', p.partenaire_id,
           'artisan', p.artisan,
           'boutique', p.boutique,
           'delai_semaines', p.delai,
           'deja_declare', exists (
             select 1 from public.declarations_ventes dv
              where dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
                and dv.periode = v_periode),
           'pieces', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'cle', d.cle, 'produit_id', d.produit_id, 'designation', d.designation,
                      'prix', d.prix, 'depose', d.quantite, 'vendu', coalesce(vd.quantite, 0),
                      'reste', d.quantite - coalesce(vd.quantite, 0),
                      'dernier_depot', d.dernier_depot)
                    order by d.designation)
               from depose d
               left join vendu vd on vd.partenaire_id = d.partenaire_id and vd.cle = d.cle
              where d.partenaire_id = p.partenaire_id), '[]'::jsonb)
         ) order by p.artisan), '[]'::jsonb)
    into v_partenaires
    from paires p;

  return jsonb_build_object('email', v_lien.email, 'periode', v_periode, 'partenaires', v_partenaires);
end;
$$;

-- --- Côté boutique : déclarer ses ventes pour un artisan donné --------------------------------
create or replace function public.boutique_declarer(
  jeton_param text,
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
  v_lien uuid;
  v_user uuid;
  v_boutique uuid;
  v_periode date := date_trunc('month', current_date)::date;
  v_total numeric(10,2) := 0;
  v_entree jsonb;
  v_propre jsonb := '[]'::jsonb;
  v_id uuid;
  v_qte numeric;
  v_cle text;
  v_pid uuid;
  v_designation text;
  v_prix numeric;
  v_depose numeric;
  v_deja numeric;
  v_alerte_ligne boolean;
  v_alerte boolean := false;
begin
  select l.id into v_lien from public.boutique_liens l where l.jeton = jeton_param and l.actif;
  if v_lien is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;

  -- Le couple est retrouvé à partir du jeton : un partenaire d'un autre lien est refusé.
  select p.user_id, p.boutique_id into v_user, v_boutique
    from public.boutique_lien_partenaires p
   where p.id = partenaire_param and p.lien_id = v_lien and p.actif;
  if v_user is null then
    return jsonb_build_object('erreur', 'partenaire_inconnu');
  end if;

  if lignes_param is null or jsonb_typeof(lignes_param) <> 'array' or jsonb_array_length(lignes_param) = 0 then
    return jsonb_build_object('erreur', 'aucune_vente');
  end if;

  for v_entree in select * from jsonb_array_elements(lignes_param) loop
    v_qte := coalesce((v_entree->>'quantite')::numeric, 0);
    v_cle := nullif(btrim(v_entree->>'cle'), '');
    continue when v_qte <= 0 or v_cle is null;

    select max(dl.designation), max(dl.prix_unitaire), max(dl.produit_id::text)::uuid
      into v_designation, v_prix, v_pid
      from public.depot_lignes dl
      join public.depots d on d.id = dl.depot_id
     where d.user_id = v_user and d.boutique_id = v_boutique and DUCLE = v_cle;
    continue when v_designation is null;   -- jamais déposé chez cette boutique : ligne refusée

    -- Ce qui était disponible au début du mois : déposé, moins ce qui a été déclaré les autres mois.
    select coalesce(sum(dl.quantite), 0) into v_depose
      from public.depot_lignes dl
      join public.depots d on d.id = dl.depot_id
     where d.user_id = v_user and d.boutique_id = v_boutique
       and d.archived_at is null and DUCLE = v_cle;

    select coalesce(sum((ligne->>'quantite')::numeric), 0) into v_deja
      from public.declarations_ventes dv, lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.user_id = v_user and dv.boutique_id = v_boutique
       and dv.periode <> v_periode and dv.statut <> 'corrigee' and (ligne->>'cle') = v_cle;

    -- On accepte (elle seule voit le stock réel) mais on le signale : c'est à l'artisane de
    -- trancher, pas à l'outil de bloquer une boutique qui dit la vérité.
    v_alerte_ligne := v_qte > (coalesce(v_depose, 0) - coalesce(v_deja, 0));
    v_alerte := v_alerte or v_alerte_ligne;

    v_total := v_total + round(v_qte * coalesce(v_prix, 0), 2);
    v_propre := v_propre || jsonb_build_object(
      'cle', v_cle, 'produit_id', v_pid, 'designation', v_designation, 'quantite', v_qte,
      'prix_unitaire', coalesce(v_prix, 0),
      'disponible', coalesce(v_depose, 0) - coalesce(v_deja, 0), 'alerte', v_alerte_ligne);
  end loop;

  if jsonb_array_length(v_propre) = 0 then
    return jsonb_build_object('erreur', 'aucune_vente');
  end if;

  insert into public.declarations_ventes (user_id, boutique_id, periode, lignes, total, note)
  values (v_user, v_boutique, v_periode, v_propre, v_total, nullif(trim(note_param), ''))
  on conflict (user_id, boutique_id, periode)
  do update set lignes = excluded.lignes, total = excluded.total, note = excluded.note,
                declare_le = now(), statut = 'declaree'
  returning id into v_id;

  return jsonb_build_object('ok', true, 'declaration_id', v_id, 'periode', v_periode,
                            'total', v_total, 'alerte', v_alerte);
end;
$$;

-- --- Côté boutique : demander un réassort -----------------------------------------------------
create or replace function public.boutique_commander(
  jeton_param text,
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
  v_lien uuid;
  v_user uuid;
  v_boutique uuid;
  v_entree jsonb;
  v_id uuid;
  v_delai int;
  v_echeance date;
  v_nb int := 0;
  v_qte numeric;
  v_cle text;
  v_pid uuid;
  v_designation text;
begin
  select l.id into v_lien from public.boutique_liens l where l.jeton = jeton_param and l.actif;
  if v_lien is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;

  select p.user_id, p.boutique_id into v_user, v_boutique
    from public.boutique_lien_partenaires p
   where p.id = partenaire_param and p.lien_id = v_lien and p.actif;
  if v_user is null then
    return jsonb_build_object('erreur', 'partenaire_inconnu');
  end if;

  if lignes_param is null or jsonb_typeof(lignes_param) <> 'array' or jsonb_array_length(lignes_param) = 0 then
    return jsonb_build_object('erreur', 'aucune_demande');
  end if;

  select coalesce(delai_semaines, 2) into v_delai from public.profil_entreprise where user_id = v_user;
  v_echeance := current_date + make_interval(weeks => coalesce(v_delai, 2));

  -- La demande devient une commande boutique ordinaire, au premier de ses statuts : elle arrive
  -- là où l'artisane travaille déjà.
  insert into public.commandes (user_id, type, boutique_id, date_echeance, statut, notes)
  values (v_user, 'boutique', v_boutique, v_echeance, 'demande', nullif(trim(note_param), ''))
  returning id into v_id;

  for v_entree in select * from jsonb_array_elements(lignes_param) loop
    v_qte := coalesce((v_entree->>'quantite')::numeric, 0);
    v_cle := nullif(btrim(v_entree->>'cle'), '');
    continue when v_qte <= 0 or v_cle is null;

    select max(dl.designation), max(dl.produit_id::text)::uuid into v_designation, v_pid
      from public.depot_lignes dl
      join public.depots d on d.id = dl.depot_id
     where d.user_id = v_user and d.boutique_id = v_boutique and DUCLE = v_cle;
    continue when v_designation is null;

    insert into public.commande_lignes (user_id, commande_id, produit_id, designation, quantite, position)
    values (v_user, v_id, v_pid, v_designation, v_qte, v_nb);
    v_nb := v_nb + 1;
  end loop;

  if v_nb = 0 then
    delete from public.commandes where id = v_id;   -- rien de valide : on n'ouvre pas la commande
    return jsonb_build_object('erreur', 'aucune_demande');
  end if;

  return jsonb_build_object('ok', true, 'commande_id', v_id, 'echeance', v_echeance, 'lignes', v_nb);
end;
$$;

-- --- Droits : ces fonctions sont publiques (le jeton EST l'authentification côté boutique), ----
-- --- les tables ne le sont pas — leçon du lien du CMS le 19/09.              -------------------
revoke all on function public.mon_lien_boutique(uuid) from public;
revoke all on function public.boutique_etat(text) from public;
revoke all on function public.boutique_declarer(text, uuid, jsonb, text) from public;
revoke all on function public.boutique_commander(text, uuid, jsonb, text) from public;

grant execute on function public.mon_lien_boutique(uuid) to authenticated;
grant execute on function public.boutique_etat(text) to anon, authenticated;
grant execute on function public.boutique_declarer(text, uuid, jsonb, text) to anon, authenticated;
grant execute on function public.boutique_commander(text, uuid, jsonb, text) to anon, authenticated;
