-- 0060 — Contester un bon : « ce bon ne correspond pas ».
--
-- Jusqu'ici la boutique n'avait que deux issues devant un bon : confirmer, ou ne rien dire et le
-- signaler de vive voix — donc nulle part. Or c'est au moment où elle compte les pièces que la
-- question se pose : il en manque une, ou il y en a une qui n'est pas sur le bon.
--
-- La contestation n'est PAS une modification du bon. Le bon signé reste la pièce qui fait foi, et
-- l'artisan seul décide de ce qu'il en fait (un nouveau bon, une reprise, une correction de
-- stock). Ce que cette migration ajoute, c'est une TRACE : un message daté, rattaché au bon,
-- affiché à l'artisan jusqu'à ce qu'il l'ait vu.
--
-- Deux choix, et pourquoi :
--   · la contestation est possible AVANT la confirmation — c'est exactement là qu'elle se pose la
--     question, et le bon reste « à confirmer » : rien ne bouge dans le stock tant que
--     l'artisan n'a pas tranché ;
--   · la boutique ne relit pas ses propres messages (aucune fonction ne les lui rend) : ce qu'elle
--     écrit est destiné à l'artisan, pas à lui-même. L'écrire deux fois par erreur (page
--     rouverte) ne crée pas deux traces — le même texte non vu est renvoyé tel quel.

create table if not exists public.bon_contestations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  depot_id uuid not null references public.depots(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  cree_le timestamptz not null default now(),
  vu_le timestamptz
);

alter table public.bon_contestations enable row level security;
drop policy if exists "bon_contestations: own rows" on public.bon_contestations;
create policy "bon_contestations: own rows" on public.bon_contestations
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index if not exists bon_contestations_boutique_idx
  on public.bon_contestations (user_id, boutique_id, cree_le desc);

-- --- La boutique contredit un bon (appelé depuis son lien) ------------------------------------
create or replace function public.boutique_contester_bon(
  jeton_param text,
  bon_param uuid,
  message_param text default null
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
  v_numero text;
  v_message text := nullif(btrim(message_param), '');
  v_id uuid;
begin
  select l.id into v_lien from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;
  if v_lien is null then
    return jsonb_build_object('erreur', 'lien_invalide');
  end if;

  if v_message is null or char_length(v_message) < 3 then
    return jsonb_build_object('erreur', 'message_vide');
  end if;

  -- Le bon doit appartenir à un couple rattaché à CE lien : un identifiant venu de l'appelant ne
  -- vaut rien tant qu'il n'a pas été retrouvé par le jeton (même règle que boutique_confirmer_bon).
  select p.user_id, p.boutique_id, d.numero into v_user, v_boutique, v_numero
    from public.depots d
    join public.boutique_lien_partenaires p
      on p.user_id = d.user_id and p.boutique_id = d.boutique_id
   where d.id = bon_param
     and p.lien_id = v_lien
     and p.actif
     and d.archived_at is null
     and d.statut in ('envoye', 'signe');

  if v_user is null then
    return jsonb_build_object('erreur', 'bon_inconnu');
  end if;

  -- Le même texte, deux fois, tant que l'artisan ne l'a pas vu : une seule trace.
  select c.id into v_id
    from public.bon_contestations c
   where c.depot_id = bon_param
     and c.vu_le is null
     and btrim(c.message) = v_message
   limit 1;

  if v_id is not null then
    return jsonb_build_object('ok', true, 'contestation_id', v_id, 'bon', v_numero, 'deja', true);
  end if;

  insert into public.bon_contestations (user_id, boutique_id, depot_id, message)
  values (v_user, v_boutique, bon_param, left(v_message, 2000))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'contestation_id', v_id, 'bon', v_numero);
end;
$$;

-- --- L'artisan marque la contestation comme vue (la trace reste, elle change de statut) ------
create or replace function public.marquer_contestation_vue(contestation_param uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;

  update public.bon_contestations
     set vu_le = coalesce(vu_le, now())
   where id = contestation_param and user_id = v_user
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('erreur', 'contestation_inconnue');
  end if;

  return jsonb_build_object('ok', true, 'contestation_id', v_id);
end;
$$;

-- --- La page de la boutique : chaque bon à confirmer dit s'il a été contesté ------------------
-- (même signature, sortie enrichie : `conteste` et `message_conteste` sur chaque bon à confirmer)
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
  select l.id, l.email into v_lien from public.boutique_liens l
   where l.jeton = jeton_param and l.actif;
  if v_lien.id is null then return jsonb_build_object('erreur', 'lien_invalide'); end if;
  update public.boutique_liens set dernier_acces = now() where id = v_lien.id;

  with paires as (
    select p.id as partenaire_id, p.user_id, p.boutique_id,
           coalesce(pe.nom, '') as artisan, coalesce(pe.delai_semaines, 2) as delai,
           (select b.nom from public.boutiques b where b.id = p.boutique_id) as boutique
      from public.boutique_lien_partenaires p
      left join public.profil_entreprise pe on pe.user_id = p.user_id
     where p.lien_id = v_lien.id and p.actif
  ), depose as (
    -- Seuls les bons CONFIRMÉS comptent : un bon signé à l'atelier mais jamais reçu n'est pas
    -- dans le stock de la boutique.
    select p.partenaire_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.produit_id, max(dl.designation) as designation, sum(dl.quantite) as quantite,
           max(dl.prix_unitaire) as prix, max(d.date_depot) as dernier_depot
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
     group by p.partenaire_id, 2, dl.produit_id
  ), derniere as (
    -- Ce qu'elle a reçu la dernière fois, par pièce : la référence du réassort.
    select distinct on (p.partenaire_id, coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))))
           p.partenaire_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.quantite as derniere_quantite
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
     order by p.partenaire_id,
              coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))),
              d.date_depot desc, dl.position desc
  ), bouge as (
    select p.partenaire_id, (ligne->>'cle') as cle,
           sum(coalesce((ligne->>'ventes')::numeric, (ligne->>'quantite')::numeric, 0)) as vendu,
           sum(coalesce((ligne->>'reprises')::numeric, 0)) as repris,
           sum(coalesce((ligne->>'entrees')::numeric, 0)) as entre
      from paires p
      join public.declarations_ventes dv on dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
      cross join lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.statut <> 'corrigee'
     group by p.partenaire_id, 2
  ), a_confirmer as (
    select p.partenaire_id,
           jsonb_agg(jsonb_build_object(
             'bon_id', d.id, 'numero', d.numero, 'date', d.date_depot,
             'pieces', (select coalesce(sum(l.quantite), 0) from public.depot_lignes l where l.depot_id = d.id),
             'lignes', (select coalesce(jsonb_agg(jsonb_build_object(
                          'designation', l.designation, 'quantite', l.quantite)
                          order by l.position), '[]'::jsonb)
                          from public.depot_lignes l where l.depot_id = d.id),
             -- Signalé par la boutique : elle dit que ce bon ne correspond pas. Le bon, lui,
             -- n'est pas modifié ; c'est à l'artisan de trancher.
             'conteste', exists (select 1 from public.bon_contestations c
                                  where c.depot_id = d.id and c.vu_le is null),
             'message_conteste', (select c.message from public.bon_contestations c
                                   where c.depot_id = d.id and c.vu_le is null
                                   order by c.cree_le desc limit 1)
           ) order by d.date_depot desc) as bons
      from paires p
      join public.depots d on d.user_id = p.user_id and d.boutique_id = p.boutique_id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is null
     group by p.partenaire_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'partenaire_id', p.partenaire_id, 'artisan', p.artisan, 'boutique', p.boutique,
      'delai_semaines', p.delai,
      'deja_declare', exists (select 1 from public.declarations_ventes dv
                               where dv.user_id = p.user_id and dv.boutique_id = p.boutique_id
                                 and dv.periode = v_periode),
      'a_confirmer', coalesce((select ac.bons from a_confirmer ac where ac.partenaire_id = p.partenaire_id), '[]'::jsonb),
      'pieces', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'cle', d.cle, 'produit_id', d.produit_id, 'designation', d.designation,
                 'prix', d.prix, 'depose', d.quantite,
                 'derniere_quantite', coalesce(de.derniere_quantite, d.quantite),
                 'vendu', coalesce(b.vendu, 0), 'repris', coalesce(b.repris, 0),
                 'entre', coalesce(b.entre, 0),
                 'reste', d.quantite + coalesce(b.entre, 0) - coalesce(b.vendu, 0) - coalesce(b.repris, 0),
                 'dernier_depot', d.dernier_depot)
               order by d.designation)
          from depose d
          left join bouge b on b.partenaire_id = d.partenaire_id and b.cle = d.cle
          left join derniere de on de.partenaire_id = d.partenaire_id and de.cle = d.cle
         where d.partenaire_id = p.partenaire_id), '[]'::jsonb)
    ) order by p.artisan), '[]'::jsonb)
    into v_partenaires
    from paires p;

  return jsonb_build_object('email', v_lien.email, 'periode', v_periode, 'partenaires', v_partenaires);
end;
$$;

-- --- Côté artisan : ce qu'on lui a signalé ---------------------------------------------------
-- (même signature que 0059, sortie enrichie : `contestations` et `contestations_non_vues` par
-- boutique. Le stock, les relevés et le jeton ne changent pas.)
create or replace function public.mes_boutiques_etat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_resultat jsonb;
begin
  if v_user is null then
    return jsonb_build_object('erreur', 'non_connecte');
  end if;

  with mes_boutiques as (
    select b.id, b.nom, b.mode, b.actif,
           l.jeton,
           l.actif as lien_actif,
           (select p.id from public.boutique_lien_partenaires p
             where p.user_id = v_user and p.boutique_id = b.id) as partenaire_id
      from public.boutiques b
      left join public.boutique_lien_partenaires p0
        on p0.boutique_id = b.id and p0.user_id = v_user
      left join public.boutique_liens l on l.id = p0.lien_id
     where b.user_id = v_user and b.actif
     order by b.nom
  ), depose as (
    -- Le stock chez la boutique : uniquement les bons qu'elle a CONFIRMÉS.
    select mb.id as boutique_id,
           coalesce('produit:' || dl.produit_id::text, 'nom:' || lower(btrim(dl.designation))) as cle,
           dl.produit_id, max(dl.designation) as designation, sum(dl.quantite) as quantite,
           max(dl.prix_unitaire) as prix
      from mes_boutiques mb
      join public.depots d on d.boutique_id = mb.id and d.user_id = v_user
      join public.depot_lignes dl on dl.depot_id = d.id
     where d.archived_at is null and d.statut in ('envoye', 'signe') and d.confirme_le is not null
     group by mb.id, 2, dl.produit_id
  ), bouge as (
    select dv.boutique_id, (ligne->>'cle') as cle,
           sum(coalesce((ligne->>'ventes')::numeric, (ligne->>'quantite')::numeric, 0)) as vendu,
           sum(coalesce((ligne->>'reprises')::numeric, 0)) as repris,
           sum(coalesce((ligne->>'entrees')::numeric, 0)) as entre
      from public.declarations_ventes dv
      cross join lateral jsonb_array_elements(dv.lignes) as ligne
     where dv.user_id = v_user and dv.statut <> 'corrigee'
     group by dv.boutique_id, 2
  ), declarations as (
    select dv.boutique_id,
           jsonb_agg(jsonb_build_object(
             'id', dv.id, 'periode', dv.periode, 'statut', dv.statut, 'note', dv.note,
             'declare_le', dv.declare_le, 'facturable', dv.total,
             'ventes', (select coalesce(sum((l->>'ventes')::numeric), 0) from jsonb_array_elements(dv.lignes) l),
             'reprises', (select coalesce(sum((l->>'reprises')::numeric), 0) from jsonb_array_elements(dv.lignes) l),
             'entrees', (select coalesce(sum((l->>'entrees')::numeric), 0) from jsonb_array_elements(dv.lignes) l),
             'alerte', (select coalesce(bool_or((l->>'alerte')::boolean), false) from jsonb_array_elements(dv.lignes) l)
           ) order by dv.declare_le desc) as liste
      from public.declarations_ventes dv
     where dv.user_id = v_user
     group by dv.boutique_id
  ), contestations as (
    -- « Ce bon ne correspond pas » : le message de la boutique, avec le bon qu'il vise. Le volume
    -- est celui d'un carnet de bord (quelques lignes), on rend tout.
    select c.boutique_id,
           count(*) filter (where c.vu_le is null)::int as non_vues,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'bon_id', c.depot_id,
             'numero', (select d.numero from public.depots d where d.id = c.depot_id),
             'date_depot', (select d.date_depot from public.depots d where d.id = c.depot_id),
             'message', c.message, 'cree_le', c.cree_le, 'vu_le', c.vu_le
           ) order by c.cree_le desc) as liste
      from public.bon_contestations c
     where c.user_id = v_user
     group by c.boutique_id
  ), en_attente as (
    select d.boutique_id, count(*)::int as nb
      from public.depots d
     where d.user_id = v_user and d.archived_at is null
       and d.statut in ('envoye', 'signe') and d.confirme_le is null
     group by d.boutique_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', mb.id, 'nom', mb.nom, 'mode', mb.mode,
      'jeton', mb.jeton, 'lien_actif', coalesce(mb.lien_actif, false),
      'bons_en_attente_de_confirmation', coalesce(ea.nb, 0),
      'pieces', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'cle', d.cle, 'produit_id', d.produit_id, 'designation', d.designation,
                 'prix', d.prix, 'depose', d.quantite,
                 'vendu', coalesce(b.vendu, 0), 'repris', coalesce(b.repris, 0),
                 'entre', coalesce(b.entre, 0),
                 'reste', d.quantite + coalesce(b.entre, 0) - coalesce(b.vendu, 0) - coalesce(b.repris, 0))
               order by d.designation)
          from depose d left join bouge b on b.boutique_id = d.boutique_id and b.cle = d.cle
         where d.boutique_id = mb.id), '[]'::jsonb),
      'declarations', coalesce((select dc.liste from declarations dc where dc.boutique_id = mb.id), '[]'::jsonb),
      'contestations', coalesce((select ct.liste from contestations ct where ct.boutique_id = mb.id), '[]'::jsonb),
      'contestations_non_vues', coalesce((select ct.non_vues from contestations ct where ct.boutique_id = mb.id), 0)
    ) order by mb.nom), '[]'::jsonb)
    into v_resultat
    from mes_boutiques mb
    left join en_attente ea on ea.boutique_id = mb.id;

  return jsonb_build_object('boutiques', v_resultat);
end;
$$;

revoke all on function public.boutique_contester_bon(text, uuid, text) from public;
revoke all on function public.marquer_contestation_vue(uuid) from public;
grant execute on function public.boutique_contester_bon(text, uuid, text) to anon, authenticated;
grant execute on function public.marquer_contestation_vue(uuid) to authenticated;

-- Les deux fonctions remplacées plus haut gardent leurs droits (`create or replace` ne touche pas
-- aux privilèges) ; on les repose quand même, l'opération est idempotente et dit l'intention.
grant execute on function public.boutique_etat(text) to anon, authenticated;
grant execute on function public.mes_boutiques_etat() to authenticated;
