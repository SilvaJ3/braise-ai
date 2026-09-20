-- 0063 — Le relevé facturable : de « elle a vendu » à « voici ce que tu factures ».
--
-- Jusqu'ici la déclaration produisait un montant, et rien de plus : pour facturer la boutique il
-- fallait rouvrir un tableur. Cette migration ferme la boucle côté artisane, en deux gestes :
--
--   1. `releve_a_emettre(boutique)` dit ce qui reste à facturer : les déclarations reçues depuis le
--      dernier relevé, jamais écartées, agrégées pièce par pièce et par prix. Les reprises y figurent mais sont
--      EXCLUES du montant — une reprise n'est pas une vente (règle de 0053) ;
--   2. `releve_emettre(boutique)` fige ce contenu dans `releves_facturables`, numérote le document
--      (`REL-2026-001`) et rattache les déclarations comptées.
--
-- Le contenu est RECOPIÉ dans le relevé, pas relu à l'affichage : une déclaration écartée après
-- coup, une pièce renommée ou un prix corrigé ne doivent pas réécrire un document déjà remis. La
-- colonne `declarations_ventes.releve_id` ne sert qu'au calcul du « reste à facturer ».
--
-- Choix assumés, écrits ici pour ne pas les redécouvrir :
--   · un relevé sans aucune vente est refusé (`rien_a_facturer`) : un document à 0 € n'apprend rien
--     à personne, et il consommerait les déclarations comptées ;
--   · une déclaration encore « à valider » compte quand même (l'artisane émet en connaissance de
--     cause), mais le compte est rendu (`a_valider`) pour que l'écran puisse le dire ;
--   · les déclarations écartées (`corrigee`) ne comptent jamais.

-- --- Le document -----------------------------------------------------------------------------
create table if not exists public.releves_facturables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  numero text not null,
  emis_le timestamptz not null default now(),
  periode_debut date not null,             -- première déclaration comptée
  periode_fin date not null,               -- dernière déclaration comptée
  lignes jsonb not null,                   -- [{cle, produit_id, designation, prix_unitaire, ventes, reprises, montant}]
  total_ventes numeric(10,2) not null default 0,
  valeur_reprises numeric(10,2) not null default 0,
  nb_declarations int not null default 0,
  pdf_path text,
  unique (user_id, numero)
);

comment on table public.releves_facturables is
  'Relevé facturable remis à une boutique : le contenu est figé à l''émission, il ne se recalcule pas.';

alter table public.releves_facturables enable row level security;
drop policy if exists "releves_facturables: own rows" on public.releves_facturables;
create policy "releves_facturables: own rows" on public.releves_facturables
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists releves_facturables_boutique_idx
  on public.releves_facturables (user_id, boutique_id, emis_le desc);

-- --- Ce qui est déjà relevé ------------------------------------------------------------------
alter table public.declarations_ventes
  add column if not exists releve_id uuid references public.releves_facturables(id) on delete set null;

create index if not exists declarations_ventes_a_relever_idx
  on public.declarations_ventes (user_id, boutique_id)
  where releve_id is null and statut <> 'corrigee';

-- --- La numérotation -------------------------------------------------------------------------
-- Même mécanique que les bons de dépôt (0029) : le compteur vit en base et s'incrémente en une
-- seule instruction, pour que deux émissions concurrentes ne portent pas le même numéro.
create table if not exists public.releve_numeros (
  annee int primary key,
  dernier int not null
);

create or replace function public.releve_numero_suivant(p_annee int) returns text
language sql
security definer
set search_path = ''
as $$
  insert into public.releve_numeros (annee, dernier) values (p_annee, 1)
  on conflict (annee) do update set dernier = public.releve_numeros.dernier + 1
  returning 'REL-' || p_annee::text || '-' || to_char(dernier, 'FM000');
$$;

revoke all on function public.releve_numero_suivant(int) from public, anon, authenticated;

-- --- Ce qu'il reste à facturer ---------------------------------------------------------------
create or replace function public.releve_a_emettre(p_boutique uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_boutique record;
  v_lignes jsonb := '[]'::jsonb;
  v_total numeric(10,2) := 0;
  v_reprises numeric := 0;
  v_valeur_reprises numeric(10,2) := 0;
  v_debut date;
  v_fin date;
  v_nb_decl int := 0;
  v_a_valider int := 0;
begin
  if v_user is null then return jsonb_build_object('erreur', 'non_connecte'); end if;

  select b.id, b.nom, b.adresse, b.email, b.mode into v_boutique
    from public.boutiques b
   where b.id = p_boutique and b.user_id = v_user and b.actif;
  if v_boutique.id is null then return jsonb_build_object('erreur', 'boutique_inconnue'); end if;

  with comptees as (
    select dv.id, dv.declare_le, dv.statut, dv.lignes
      from public.declarations_ventes dv
     where dv.user_id = v_user and dv.boutique_id = p_boutique
       and dv.statut <> 'corrigee' and dv.releve_id is null
  ), detail as (
    -- Agrégation par pièce ET par prix : le montant d'une ligne est le produit de ce qui a été
    -- vendu par le prix qui courait alors. Additionner des ventes faites à deux prix différents
    -- pour les multiplier par un seul d'entre eux donnerait un montant faux ; ici, deux prix
    -- différents font deux lignes, ce qui se lit sans se tromper.
    select l->>'cle' as cle,
           max(l->>'designation') as designation,
           max(l->>'produit_id')::uuid as produit_id,
           -- Le prix se lit sous les deux noms : les déclarations écrites avant 0053 portent
           -- `prix`, les suivantes `prix_unitaire`. Sans ce repli, un relevé facturable sortait à
           -- 0 € sur les déclarations anciennes — trouvé en appelant la fonction sur les données
           -- réelles du compte de test, pas en relisant le code.
           coalesce((l->>'prix_unitaire')::numeric, (l->>'prix')::numeric, 0) as prix_unitaire,
           sum(coalesce((l->>'ventes')::numeric, (l->>'quantite')::numeric, 0)) as ventes,
           sum(coalesce((l->>'reprises')::numeric, 0)) as reprises
      from comptees c
      cross join lateral jsonb_array_elements(c.lignes) as l
     group by 1, 4
    having sum(coalesce((l->>'ventes')::numeric, (l->>'quantite')::numeric, 0)
             + coalesce((l->>'reprises')::numeric, 0)) <> 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cle', d.cle,
           'produit_id', d.produit_id,
           'designation', coalesce(d.designation, 'Pièce sans nom'),
           'prix_unitaire', d.prix_unitaire,
           'ventes', d.ventes,
           'reprises', d.reprises,
           'montant', round(d.ventes * d.prix_unitaire, 2)) order by d.designation),
         '[]'::jsonb),
         coalesce(sum(round(d.ventes * d.prix_unitaire, 2)), 0),
         coalesce(sum(d.reprises), 0),
         coalesce(sum(round(d.reprises * d.prix_unitaire, 2)), 0)
    into v_lignes, v_total, v_reprises, v_valeur_reprises
    from detail d;

  with comptees as (
    select dv.declare_le, dv.statut
      from public.declarations_ventes dv
     where dv.user_id = v_user and dv.boutique_id = p_boutique
       and dv.statut <> 'corrigee' and dv.releve_id is null
  )
  select count(*)::int,
         count(*) filter (where c.statut = 'declaree')::int,
         min(c.declare_le)::date,
         max(c.declare_le)::date
    into v_nb_decl, v_a_valider, v_debut, v_fin
    from comptees c;

  return jsonb_build_object(
    'boutique', jsonb_build_object('id', v_boutique.id, 'nom', v_boutique.nom,
                                   'adresse', v_boutique.adresse, 'email', v_boutique.email,
                                   'mode', v_boutique.mode),
    'lignes', v_lignes,
    'total_ventes', v_total,
    'nb_pieces', coalesce((select sum((l->>'ventes')::numeric) from jsonb_array_elements(v_lignes) l), 0),
    'nb_reprises', v_reprises,
    'valeur_reprises', v_valeur_reprises,
    'nb_declarations', v_nb_decl,
    'a_valider', v_a_valider,
    'periode_debut', v_debut,
    'periode_fin', v_fin,
    'dernier_numero', (select r.numero from public.releves_facturables r
                        where r.user_id = v_user and r.boutique_id = p_boutique
                        order by r.emis_le desc limit 1),
    'dernier_emis_le', (select r.emis_le from public.releves_facturables r
                         where r.user_id = v_user and r.boutique_id = p_boutique
                         order by r.emis_le desc limit 1));
end;
$$;

-- --- Émettre le relevé ------------------------------------------------------------------------
create or replace function public.releve_emettre(p_boutique uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_apercu jsonb;
  v_numero text;
  v_id uuid;
  v_a_verrouiller uuid;
begin
  if v_user is null then return jsonb_build_object('erreur', 'non_connecte'); end if;

  -- Les déclarations à compter sont verrouillées avant le calcul : deux émissions simultanées ne
  -- peuvent pas figer les mêmes mouvements deux fois.
  for v_a_verrouiller in
    select dv.id from public.declarations_ventes dv
     where dv.user_id = v_user and dv.boutique_id = p_boutique
       and dv.statut <> 'corrigee' and dv.releve_id is null
     for update
  loop
    null;
  end loop;

  v_apercu := public.releve_a_emettre(p_boutique);
  if v_apercu ? 'erreur' then return v_apercu; end if;
  if coalesce((v_apercu->>'total_ventes')::numeric, 0) <= 0 then
    return jsonb_build_object('erreur', 'rien_a_facturer');
  end if;

  v_numero := public.releve_numero_suivant(extract(year from current_date)::int);

  insert into public.releves_facturables
    (user_id, boutique_id, numero, periode_debut, periode_fin, lignes,
     total_ventes, valeur_reprises, nb_declarations)
  values
    (v_user, p_boutique, v_numero,
     (v_apercu->>'periode_debut')::date, (v_apercu->>'periode_fin')::date, v_apercu->'lignes',
     (v_apercu->>'total_ventes')::numeric, (v_apercu->>'valeur_reprises')::numeric,
     coalesce((v_apercu->>'nb_declarations')::int, 0))
  returning id into v_id;

  update public.declarations_ventes dv
     set releve_id = v_id
   where dv.user_id = v_user and dv.boutique_id = p_boutique
     and dv.statut <> 'corrigee' and dv.releve_id is null;

  return v_apercu || jsonb_build_object('ok', true, 'releve_id', v_id, 'numero', v_numero);
end;
$$;

revoke all on function public.releve_a_emettre(uuid) from public, anon;
revoke all on function public.releve_emettre(uuid) from public, anon;
grant execute on function public.releve_a_emettre(uuid) to authenticated;
grant execute on function public.releve_emettre(uuid) to authenticated;
