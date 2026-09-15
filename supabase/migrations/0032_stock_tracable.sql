-- 0032 — Le stock devient traçable et la réception fournisseur idempotente.
--
-- Deux défauts corrigés :
-- 1. `matieres_premieres.stock_actuel` était modifié par un update direct du client (valeur
--    absolue saisie), sans aucun journal : impossible d'expliquer une divergence entre stock
--    théorique et réel, et deux éditions concurrentes s'écrasaient.
-- 2. Le trigger de réception créditait le stock à chaque passage de statut vers 'recue', sans
--    rien mémoriser : un retour en arrière suivi d'un nouveau 'recue' doublait le stock en
--    silence. Il était en outre AFTER UPDATE seulement, donc une commande créée directement en
--    'recue' n'imputait jamais le stock.

-- 1. Journal des mouvements ---------------------------------------------------------------

create table public.stock_mouvements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  matiere_id uuid not null,
  -- Positif = entrée, négatif = sortie. Jamais 0 : un mouvement nul ne raconte rien.
  delta numeric(12,3) not null check (delta <> 0),
  motif text not null check (motif in ('reception','production','correction','perte','inventaire')),
  ref text check (ref is null or char_length(ref) <= 200),
  created_at timestamptz not null default now(),
  foreign key (user_id, matiere_id) references public.matieres_premieres (user_id, id)
    on delete cascade
);

alter table public.stock_mouvements enable row level security;

create policy "stock_mouvements: own rows" on public.stock_mouvements
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index stock_mouvements_matiere_idx
  on public.stock_mouvements (matiere_id, created_at desc);

-- 2. Un chemin d'écriture unique, incrémental ----------------------------------------------

create or replace function public.ajuster_stock(
  p_matiere uuid,
  p_delta numeric,
  p_motif text,
  p_ref text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Le contrôle de propriété est explicite : la fonction est SECURITY DEFINER, elle contourne
  -- donc la RLS et ne doit agir que sur une matière de l'appelant.
  if not exists (
    select 1 from public.matieres_premieres
    where id = p_matiere and user_id = auth.uid()
  ) then
    raise exception 'matière inconnue ou non autorisée' using errcode = 'insufficient_privilege';
  end if;

  insert into public.stock_mouvements (matiere_id, delta, motif, ref)
  values (p_matiere, p_delta, p_motif, p_ref);

  update public.matieres_premieres
  set stock_actuel = stock_actuel + p_delta
  where id = p_matiere;
end $$;

revoke all on function public.ajuster_stock(uuid, numeric, text, text) from public, anon;
grant execute on function public.ajuster_stock(uuid, numeric, text, text) to authenticated;

-- 3. Réception fournisseur idempotente -----------------------------------------------------
--
-- L'idempotence est portée par la donnée (stock_impute_at) et non par le sens de la transition
-- de statut. Vérifié avant écriture : aucune commande n'est encore au statut 'recue', donc
-- aucune n'a de stock à ne pas recréditer.

alter table public.commandes_fournisseur add column stock_impute_at timestamptz;

create or replace function public.commande_fournisseur_receptionner() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lignes record;
begin
  if new.statut = 'recue' and new.stock_impute_at is null then
    -- Le mouvement est journalisé par matière, puis le stock incrémenté du même delta : les
    -- deux restent cohérents même si la commande est modifiée après coup.
    for v_lignes in
      select matiere_id, sum(quantite) as quantite
      from public.commande_fournisseur_lignes
      where commande_fournisseur_id = new.id
      group by matiere_id
    loop
      insert into public.stock_mouvements (user_id, matiere_id, delta, motif, ref)
      values (new.user_id, v_lignes.matiere_id, v_lignes.quantite, 'reception',
              'commande ' || new.id::text);

      update public.matieres_premieres
      set stock_actuel = stock_actuel + v_lignes.quantite
      where id = v_lignes.matiere_id and user_id = new.user_id;
    end loop;

    new.stock_impute_at := now();
    new.date_reception := coalesce(new.date_reception, current_date);
  end if;
  return new;
end $$;

-- BEFORE (et non AFTER) : le trigger pose lui-même stock_impute_at et date_reception.
drop trigger if exists commandes_fournisseur_receptionner on public.commandes_fournisseur;
create trigger commandes_fournisseur_receptionner
  before insert or update on public.commandes_fournisseur
  for each row execute function public.commande_fournisseur_receptionner();

-- 4. Les dates doivent raconter une histoire cohérente --------------------------------------

alter table public.commandes_fournisseur
  add constraint cf_dates_ordonnees
  check (date_reception is null or date_commande is null or date_reception >= date_commande);
