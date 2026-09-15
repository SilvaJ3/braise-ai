-- 0029 — Le bon de dépôt est une pièce contractuelle : il ne se supprime plus une fois signé,
-- et sa numérotation annuelle devient monotone.
--
-- Deux défauts corrigés ici :
-- 1. La policy `depots: own rows` est `for all`, donc DELETE inclus : l'app exposait la
--    suppression définitive d'un bon signé, numéroté et envoyé par mail (cascade sur
--    depot_lignes, PDF orphelin dans Storage).
-- 2. `attribuerNumero()` côté edge function faisait un count(*) des bons de l'année puis
--    écrivait ce nombre + 1. Deux signatures concurrentes lisaient le même count et
--    obtenaient le même numéro, et supprimer un bon faisait reculer le compteur — donc un
--    numéro déjà émis pouvait être réattribué à un autre document.

-- 1. Interdire la suppression d'un bon qui n'est plus un brouillon ---------------------------

create or replace function public.depots_no_delete_si_signe() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut <> 'brouillon' or old.signed_at is not null then
    raise exception 'Bon de dépôt signé (%) : à archiver, pas à supprimer', old.numero
      using errcode = 'restrict_violation';
  end if;
  return old;
end $$;

create trigger depots_no_delete before delete on public.depots
  for each row execute function public.depots_no_delete_si_signe();

-- 2. Numérotation monotone, attribuée en base ------------------------------------------------

-- Compteur par année. Aucune policy RLS : accès service_role uniquement (l'edge function),
-- pour que le client ne puisse ni le lire ni le manipuler.
create table public.depot_numeros (
  annee int primary key,
  dernier int not null default 0
);

alter table public.depot_numeros enable row level security;

-- Reprise de l'existant : 2026-001 … 2026-006 → dernier = 6.
insert into public.depot_numeros (annee, dernier)
select (regexp_match(numero, '^(\d{4})-'))[1]::int,
       max((regexp_match(numero, '-(\d+)$'))[1]::int)
from public.depots
where numero ~ '^\d{4}-\d+$'
group by 1;

-- Format identique à numeroSuivant() de _shared/depot-doc.ts : `2026-001`, et `2026-1000`
-- au-delà de 999. to_char (et non lpad, qui tronquerait '1000' à '100').
create or replace function public.depot_numero_suivant(p_annee int) returns text
language sql
security definer
set search_path = ''
as $$
  insert into public.depot_numeros (annee, dernier) values (p_annee, 1)
  on conflict (annee) do update set dernier = public.depot_numeros.dernier + 1
  returning p_annee::text || '-' || to_char(dernier, 'FM000');
$$;

revoke all on function public.depot_numero_suivant(int) from public, anon, authenticated;

-- Filet de sécurité : si deux appels concurrents produisaient malgré tout le même numéro,
-- l'unicité le fait échouer franchement au lieu de créer deux bons homonymes.
create unique index if not exists depots_user_numero_key
  on public.depots (user_id, numero) where numero is not null;

-- 3. Le statut dit la vérité sur ce qui a été signé et envoyé --------------------------------
--
-- Vérifié avant écriture : les 8 bons existants respectent déjà cette règle
-- (2 brouillons sans numéro ni signature, 1 signé avec numéro + signature sans envoi,
-- 5 envoyés complets), donc la contrainte peut être posée directement.

alter table public.depots add constraint depots_statut_coherent check (
  (statut = 'brouillon' and numero is null and signed_at is null and sent_at is null)
  or (statut = 'signe' and numero is not null and signed_at is not null and sent_at is null)
  or (statut = 'envoye' and numero is not null and signed_at is not null and sent_at is not null)
);
