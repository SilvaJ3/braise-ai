-- 0051 — Le lien boutique : la boutique déclare ses ventes et passe commande.
--
-- Le bon de dépôt part vers la boutique et rien ne revient : elle répond par mail, l'artisane
-- ressaisit. On ouvre un canal de retour, sans compte à créer côté boutique — un lien nominatif
-- par couple artisan ↔ boutique, révocable par l'artisane.
--
-- Trois choses en découlent :
--   1. ce qui est vendu est déclaré par la boutique, daté et à son nom (une déclaration, pas une
--      vérité : l'artisane valide ou corrige) ;
--   2. le restant chez la boutique est *calculé* (dépôt − ventes déclarées), jamais saisi ;
--   3. une demande de réassort devient une commande boutique ordinaire, statut « demande » :
--      elle arrive là où l'artisane travaille déjà, avec ses statuts existants.
--
-- Sécurité : la page ne s'authentifie pas, elle présente un jeton. Les fonctions ci-dessous sont
-- donc `security definer` et ne font JAMAIS confiance à un identifiant venu de l'appelant : elles
-- retrouvent l'artisane et la boutique à partir du seul jeton. Les paramètres sont préfixés pour
-- ne pas pouvoir être confondus avec un nom de colonne (leçon du 19/09 sur le CMS).

-- --- Le délai de production, réglable par l'artisane ---------------------------------------
alter table public.profil_entreprise
  add column if not exists delai_semaines int not null default 2
    check (delai_semaines between 0 and 52);

-- --- Les liens ------------------------------------------------------------------------------
create table if not exists public.boutique_liens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  jeton text not null unique check (char_length(jeton) between 32 and 80),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  dernier_acces timestamptz,
  unique (user_id, boutique_id)
);

alter table public.boutique_liens enable row level security;
drop policy if exists "boutique_liens: own rows" on public.boutique_liens;
create policy "boutique_liens: own rows" on public.boutique_liens
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists boutique_liens_jeton_idx on public.boutique_liens (jeton) where actif;

-- --- Les déclarations de ventes --------------------------------------------------------------
create table if not exists public.declarations_ventes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  periode date not null,                    -- premier jour du mois déclaré
  lignes jsonb not null,                    -- [{produit_id, designation, quantite, prix_unitaire}]
  total numeric(10,2) not null default 0,
  note text check (note is null or char_length(note) <= 2000),
  declare_le timestamptz not null default now(),
  statut text not null default 'declaree' check (statut in ('declaree', 'validee', 'corrigee')),
  unique (user_id, boutique_id, periode)
);

alter table public.declarations_ventes enable row level security;
drop policy if exists "declarations_ventes: own rows" on public.declarations_ventes;
create policy "declarations_ventes: own rows" on public.declarations_ventes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists declarations_ventes_couple_idx
  on public.declarations_ventes (user_id, boutique_id, periode desc);

-- --- Ce que la boutique voit : ses pièces, son restant, le délai -----------------------------
create or replace function public.boutique_etat(jeton_param text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lien record;
  pieces jsonb;
  delai int;
  artisan text;
  boutique_nom text;
  periode_courante date := date_trunc('month', current_date)::date;
  deja_declare boolean;
begin
  select l.id, l.user_id, l.boutique_id into lien
    from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;

  if lien.id is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;

  update public.boutique_liens set dernier_acces = now() where id = lien.id;

  select coalesce(pe.nom, ''), coalesce(pe.delai_semaines, 2)
    into artisan, delai
    from public.profil_entreprise pe
   where pe.user_id = lien.user_id;

  select b.nom into boutique_nom from public.boutiques b where b.id = lien.boutique_id;

  -- Une ligne par produit : ce qui a été déposé, ce qui est vendu, ce qui reste.
  -- Le restant n'est jamais stocké : il se calcule.
  with depose as (
    select dl.produit_id,
           max(dl.designation)                                        as designation,
           sum(dl.quantite)                                           as quantite,
           max(dl.prix_unitaire)                                      as prix,
           max(d.date_depot)                                          as dernier_depot
      from public.depot_lignes dl
      join public.depots d on d.id = dl.depot_id
     where d.user_id = lien.user_id
       and d.boutique_id = lien.boutique_id
       and d.archived_at is null
     group by dl.produit_id
  ), vendu as (
    select (l->>'produit_id')::uuid as produit_id,
           sum((l->>'quantite')::numeric) as quantite
      from public.declarations_ventes dv,
           lateral jsonb_array_elements(dv.lignes) l
     where dv.user_id = lien.user_id
       and dv.boutique_id = lien.boutique_id
       and dv.statut <> 'corrigee'
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'produit_id',   d.produit_id,
           'designation',  d.designation,
           'prix',         d.prix,
           'depose',       d.quantite,
           'vendu',        coalesce(v.quantite, 0),
           'reste',        d.quantite - coalesce(v.quantite, 0),
           'dernier_depot', d.dernier_depot
         ) order by d.designation), '[]'::jsonb)
    into pieces
    from depose d
    left join vendu v on v.produit_id is not distinct from d.produit_id;

  select exists (
    select 1 from public.declarations_ventes dv
     where dv.user_id = lien.user_id
       and dv.boutique_id = lien.boutique_id
       and dv.periode = periode_courante
  ) into deja_declare;

  return jsonb_build_object(
    'artisan',        artisan,
    'boutique',       boutique_nom,
    'delai_semaines', delai,
    'periode',        periode_courante,
    'deja_declare',   deja_declare,
    'pieces',         pieces
  );
end;
$$;

-- --- La boutique déclare ses ventes du mois --------------------------------------------------
create or replace function public.boutique_declarer(
  jeton_param text,
  lignes_param jsonb,
  note_param text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lien record;
  periode date := date_trunc('month', current_date)::date;
  total numeric(10,2) := 0;
  ligne jsonb;
  propre jsonb := '[]'::jsonb;
  id_declaration uuid;
begin
  select l.id, l.user_id, l.boutique_id into lien
    from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;

  if lien.id is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;

  if lignes_param is null or jsonb_typeof(lignes_param) <> 'array' or jsonb_array_length(lignes_param) = 0 then
    return jsonb_build_object('erreur', 'aucune_vente');
  end if;

  -- On ne garde que les produits réellement déposés chez cette boutique, et on ignore les zéros.
  for ligne in select * from jsonb_array_elements(lignes_param) loop
    declare
      qte numeric := coalesce((ligne->>'quantite')::numeric, 0);
      pid uuid := nullif(ligne->>'produit_id', '')::uuid;
      designation text;
      prix numeric;
    begin
      continue when qte <= 0;
      select max(dl.designation), max(dl.prix_unitaire)
        into designation, prix
        from public.depot_lignes dl
        join public.depots d on d.id = dl.depot_id
       where d.user_id = lien.user_id
         and d.boutique_id = lien.boutique_id
         and dl.produit_id is not distinct from pid;

      continue when designation is null;   -- produit jamais déposé ici : on refuse la ligne
      total := total + round(qte * coalesce(prix, 0), 2);
      propre := propre || jsonb_build_object(
        'produit_id', pid, 'designation', designation,
        'quantite', qte, 'prix_unitaire', coalesce(prix, 0));
    end;
  end loop;

  if jsonb_array_length(propre) = 0 then
    return jsonb_build_object('erreur', 'aucune_vente');
  end if;

  insert into public.declarations_ventes (user_id, boutique_id, periode, lignes, total, note)
  values (lien.user_id, lien.boutique_id, periode, propre, total, nullif(trim(note_param), ''))
  on conflict (user_id, boutique_id, periode)
  do update set lignes = excluded.lignes,
                total = excluded.total,
                note = excluded.note,
                declare_le = now(),
                statut = 'declaree'
  returning id into id_declaration;

  return jsonb_build_object('ok', true, 'declaration_id', id_declaration,
                            'periode', periode, 'total', total);
end;
$$;

-- --- La boutique passe une demande de réassort -----------------------------------------------
create or replace function public.boutique_commander(
  jeton_param text,
  lignes_param jsonb,
  note_param text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lien record;
  ligne jsonb;
  id_commande uuid;
  delai int;
  echeance date;
  nb int := 0;
begin
  select l.id, l.user_id, l.boutique_id into lien
    from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;

  if lien.id is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;

  if lignes_param is null or jsonb_typeof(lignes_param) <> 'array' or jsonb_array_length(lignes_param) = 0 then
    return jsonb_build_object('erreur', 'aucune_demande');
  end if;

  select coalesce(delai_semaines, 2) into delai
    from public.profil_entreprise where user_id = lien.user_id;
  echeance := current_date + make_interval(weeks => coalesce(delai, 2));

  insert into public.commandes (user_id, type, boutique_id, date_echeance, statut, notes)
  values (lien.user_id, 'boutique', lien.boutique_id, echeance, 'demande',
          nullif(trim(note_param), ''))
  returning id into id_commande;

  for ligne in select * from jsonb_array_elements(lignes_param) loop
    declare
      qte numeric := coalesce((ligne->>'quantite')::numeric, 0);
      pid uuid := nullif(ligne->>'produit_id', '')::uuid;
      designation text;
    begin
      continue when qte <= 0;
      select max(dl.designation) into designation
        from public.depot_lignes dl
        join public.depots d on d.id = dl.depot_id
       where d.user_id = lien.user_id
         and d.boutique_id = lien.boutique_id
         and dl.produit_id is not distinct from pid;
      continue when designation is null;

      insert into public.commande_lignes (user_id, commande_id, produit_id, designation, quantite, position)
      values (lien.user_id, id_commande, pid, designation, qte, nb);
      nb := nb + 1;
    end;
  end loop;

  if nb = 0 then
    delete from public.commandes where id = id_commande;   -- rien de valide : on n'ouvre pas la commande
    return jsonb_build_object('erreur', 'aucune_demande');
  end if;

  return jsonb_build_object('ok', true, 'commande_id', id_commande, 'echeance', echeance, 'lignes', nb);
end;
$$;

-- --- Droits : ces trois fonctions sont publiques (le jeton EST l'authentification), -----------
-- --- les tables ne le sont pas (le lien du CMS a montré pourquoi).          -------------------
revoke all on function public.boutique_etat(text) from public;
revoke all on function public.boutique_declarer(text, jsonb, text) from public;
revoke all on function public.boutique_commander(text, jsonb, text) from public;
grant execute on function public.boutique_etat(text) to anon, authenticated;
grant execute on function public.boutique_declarer(text, jsonb, text) to anon, authenticated;
grant execute on function public.boutique_commander(text, jsonb, text) to anon, authenticated;
