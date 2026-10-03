-- Validation des migrations 0080, 0081 et 0082 — dans une transaction ANNULÉE à la fin : aucune trace en base.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/boutique_abonnement.sql
--
-- Le script applique lui-même les trois fichiers à l'intérieur de la transaction (\i), puis vérifie : droits,
-- comportement, et ABSENCE de régression sur les fonctions publiques du lien. Il ne s'exécute que sur une
-- base où ces trois migrations ne sont PAS déjà appliquées (sinon `create function` échoue : c'est voulu).
begin;

create function pg_temp.attend(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ÉCHEC : %', msg; end if;
  raise notice 'OK    %', msg;
end $$;

-- Exécute une instruction sous un rôle donné ; rend le SQLSTATE obtenu (ou 'ok').
create function pg_temp.essaie(utilisateur uuid, role_pg text, instruction text) returns text language plpgsql as $$
declare etat text := 'ok';
begin
  execute format('set local role %I', role_pg);
  perform set_config('request.jwt.claims', json_build_object('sub', utilisateur, 'role', role_pg)::text, true);
  begin
    execute instruction;
  exception when others then etat := sqlstate;
  end;
  reset role;
  return etat;
end $$;

-- ---- État AVANT : on mémorise ce qui ne doit pas bouger -----------------------------------------------------
create temp table avant as
  select (select count(*) from public.boutique_liens) as liens,
         (select count(*) from public.boutique_lien_partenaires) as partenaires,
         (select count(*) from public.declarations_ventes) as declarations,
         has_function_privilege('authenticated', 'public.boutique_etat(text)', 'execute') as etat_auth,
         has_function_privilege('anon', 'public.boutique_etat(text)', 'execute') as etat_anon,
         has_function_privilege('anon', 'public.boutique_commander(text,uuid,jsonb,text)', 'execute') as cmd_anon,
         has_function_privilege('authenticated', 'public.mon_compte_boutique()', 'execute') as mcb_auth;

\i supabase/migrations/20261004090000_0080_hygiene_droits_boutique.sql
\i supabase/migrations/20261004091000_0081_rattacher_compte_boutique.sql
\i supabase/migrations/20261004092000_0082_boutique_abonnements.sql

-- ---- 0080 : droits de table fermés, fonctions du lien INTACTES -----------------------------------------------
select pg_temp.attend(not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name in ('boutique_liens','boutique_lien_partenaires','declarations_ventes')
       and grantee in ('anon','authenticated')), 'anon et authenticated n''ont plus AUCUN droit sur les trois tables');
select pg_temp.attend(has_table_privilege('service_role', 'public.boutique_liens', 'select, insert, update, delete'),
    'service_role garde ses droits (la fonction depot lit ces tables)');
select pg_temp.attend((select liens = (select count(*) from public.boutique_liens)
                          and partenaires = (select count(*) from public.boutique_lien_partenaires)
                          and declarations = (select count(*) from public.declarations_ventes) from avant),
    'aucune ligne perdue ni ajoutée');
select pg_temp.attend(has_function_privilege('anon', 'public.boutique_etat(text)', 'execute') = (select etat_anon from avant)
                  and has_function_privilege('authenticated', 'public.boutique_etat(text)', 'execute') = (select etat_auth from avant)
                  and has_function_privilege('anon', 'public.boutique_commander(text,uuid,jsonb,text)', 'execute') = (select cmd_anon from avant)
                  and has_function_privilege('authenticated', 'public.mon_compte_boutique()', 'execute') = (select mcb_auth from avant),
    'les fonctions publiques du lien gardent EXACTEMENT leurs droits d''avant (le jeton reste la porte)');
select pg_temp.attend(not has_function_privilege('anon', 'public.mon_compte()', 'execute')
                  and has_function_privilege('authenticated', 'public.mon_compte()', 'execute')
                  and has_function_privilege('service_role', 'public.mon_compte()', 'execute'),
    'mon_compte() : fermée à anon, ouverte aux comptes connectés (l''écran « Mon compte » ne casse pas)');
select pg_temp.attend(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and not p.prosecdef
       and (p.prosrc ilike '%boutique_liens%' or p.prosrc ilike '%boutique_lien_partenaires%' or p.prosrc ilike '%declarations_ventes%')),
    'aucune fonction SECURITY INVOKER ne lit les trois tables (le retrait des droits ne la casserait pas en silence)');

-- ---- 0081 : rattacher / détacher ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rattache-1@test.invalid'),
  ('c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rattache-2@test.invalid');
insert into public.boutique_liens (id, email, jeton) values
  ('b1000000-0000-4000-8000-000000000001', 'boutique-test-1@test.invalid', repeat('a', 40)),
  ('b1000000-0000-4000-8000-000000000002', 'boutique-test-2@test.invalid', repeat('b', 40));

select pg_temp.attend(pg_temp.essaie(null, 'anon', $f$select public.rattacher_compte_boutique(gen_random_uuid(), gen_random_uuid())$f$) = '42501',
    'rattacher : fermé à anon');
select pg_temp.attend(pg_temp.essaie('c1000000-0000-4000-8000-000000000001', 'authenticated', $f$select public.rattacher_compte_boutique(gen_random_uuid(), gen_random_uuid())$f$) = '42501',
    'rattacher : fermé aux comptes connectés (pas de rattachement par un client)');
select pg_temp.attend(pg_temp.essaie('c1000000-0000-4000-8000-000000000001', 'authenticated', $f$select public.detacher_compte_boutique(gen_random_uuid())$f$) = '42501',
    'détacher : fermé aux comptes connectés');
select pg_temp.attend((public.rattacher_compte_boutique(gen_random_uuid(), 'c1000000-0000-4000-8000-000000000001')->>'erreur') = 'lien_inconnu', 'lien inconnu refusé');
select pg_temp.attend((public.rattacher_compte_boutique('b1000000-0000-4000-8000-000000000001', gen_random_uuid())->>'erreur') = 'compte_inconnu', 'compte inconnu refusé');
select pg_temp.attend((public.rattacher_compte_boutique('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001')->>'ok')::boolean,
    'rattachement du compte 1 au lien 1');
select pg_temp.attend((select compte_id from public.boutique_liens where id = 'b1000000-0000-4000-8000-000000000001') = 'c1000000-0000-4000-8000-000000000001',
    'compte_id posé');
select pg_temp.attend((public.rattacher_compte_boutique('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001')->>'erreur') = 'deja_rattache', 'rattacher deux fois le même couple : dit « déjà rattaché »');
select pg_temp.attend((public.rattacher_compte_boutique('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000002')->>'erreur') = 'lien_deja_rattache', 'un lien déjà relié à un autre compte : refusé, rien n''est écrasé');
select pg_temp.attend((public.rattacher_compte_boutique('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001')->>'erreur') = 'compte_deja_rattache', 'un compte déjà relié à un autre lien : refusé');
select pg_temp.attend((select compte_id from public.boutique_liens where id = 'b1000000-0000-4000-8000-000000000001') = 'c1000000-0000-4000-8000-000000000001',
    'après les refus, le rattachement d''origine est intact');
select pg_temp.attend((public.rattacher_compte_boutique('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002')->>'email_identique')::boolean is false,
    'une adresse de compte différente de celle du lien est signalée, pas refusée');

-- ---- 0082 : table fermée, lecture par le compte, accès offert -----------------------------------------------
select pg_temp.attend(pg_temp.essaie('c1000000-0000-4000-8000-000000000001', 'authenticated', $f$select * from public.boutique_abonnements$f$) = '42501',
    'boutique_abonnements : illisible directement par un compte connecté');
select pg_temp.attend(pg_temp.essaie('c1000000-0000-4000-8000-000000000001', 'authenticated', $f$update public.boutique_abonnements set statut = 'actif'$f$) = '42501',
    'boutique_abonnements : inscriptible par personne côté client (pas de « s''offrir actif »)');
select pg_temp.attend(pg_temp.essaie(null, 'anon', $f$select public.mon_abonnement_boutique()$f$) = '42501', 'mon_abonnement_boutique : fermée à anon');
select pg_temp.attend(pg_temp.essaie('c1000000-0000-4000-8000-000000000001', 'authenticated', $f$select public.offrir_acces_boutique('b1000000-0000-4000-8000-000000000001', 3)$f$) = '42501',
    'offrir_acces_boutique : fermée aux comptes connectés (personne ne s''offre des mois)');
select pg_temp.attend(pg_temp.essaie(null, 'anon', $f$select public.offrir_acces_boutique('b1000000-0000-4000-8000-000000000001', 3)$f$) = '42501', 'offrir_acces_boutique : fermée à anon');

-- Un compte connecté lit SON abonnement : aucun au départ
create temp table lu (r jsonb); grant all on lu to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into lu select public.mon_abonnement_boutique();
reset role;
select pg_temp.attend((select r->>'statut' = 'aucun' and (r->>'acces_offert')::boolean is false from lu), 'sans ligne : statut « aucun », pas d''accès offert');

select pg_temp.attend((public.offrir_acces_boutique('b1000000-0000-4000-8000-000000000001', 3, 'test')->>'ok')::boolean, 'accès offert de 3 mois posé par l''administration');
select pg_temp.attend((select acces_offert_jusqu_au = (current_date + interval '3 months')::date from public.boutique_abonnements where lien_id = 'b1000000-0000-4000-8000-000000000001'),
    'la date est dans trois mois à partir d''aujourd''hui');
delete from lu;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into lu select public.mon_abonnement_boutique();
reset role;
select pg_temp.attend((select r->>'statut' = 'offert' and (r->>'acces_offert')::boolean from lu), 'le compte voit son accès offert');
select pg_temp.attend((public.offrir_acces_boutique('b1000000-0000-4000-8000-000000000001', 0)->>'erreur') = 'duree_invalide', 'durée de 0 mois refusée');
select pg_temp.attend((public.offrir_acces_boutique('b1000000-0000-4000-8000-000000000001', 13)->>'erreur') = 'duree_invalide', 'durée de 13 mois refusée');
select pg_temp.attend((public.offrir_acces_boutique(gen_random_uuid(), 3)->>'erreur') = 'lien_inconnu', 'lien inconnu refusé');

-- Un abonnement PAYANT en cours n'est jamais écrasé par un cadeau
update public.boutique_abonnements set statut = 'actif' where lien_id = 'b1000000-0000-4000-8000-000000000001';
select pg_temp.attend((public.offrir_acces_boutique('b1000000-0000-4000-8000-000000000001', 3)->>'erreur') = 'abonnement_payant_en_cours', 'un abonnement payant en cours n''est pas écrasé par l''accès offert');

-- Un compte non boutique n'a aucun abonnement à voir
insert into auth.users (id, aud, role, email) values ('c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'artisan@test.invalid');
delete from lu;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into lu select public.mon_abonnement_boutique();
reset role;
select pg_temp.attend((select r->>'erreur' = 'pas_un_compte_boutique' from lu), 'un compte non boutique : « pas_un_compte_boutique », rien d''autre');

\echo 'TOUS LES TESTS PASSENT — transaction annulée'
rollback;
