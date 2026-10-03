-- 0082 — L'abonnement de la boutique : une table à elle, et l'accès OFFERT par une date.
--
-- Décision (JSB, 03/10) : l'abonnement boutique vit dans une table DÉDIÉE, pas sur `boutique_liens`
-- (qui porte le jeton public) ni sur `assistant_profil` (table de l'artisan). Trois mois offerts :
-- un ACCÈS OFFERT jusqu'à une date (`acces_offert_jusqu_au`), puis un paiement que la boutique déclenche
-- elle-même. Aucune carte, aucun prélèvement automatique : « rien n'est prélevé sans ton accord ».
--
-- CE QUE CETTE MIGRATION NE FAIT PAS (volontairement) :
--   · rien ne LIT encore cette table pour ouvrir ou fermer quoi que ce soit : aucun effet visible, aucun
--     paywall. La boutique n'est jamais pénalisée par erreur (le lien reste une porte sans compte) ;
--   · rien de Stripe n'écrit ici : les colonnes sont prêtes pour le webhook discriminé (étape suivante) ;
--   · aucun prix n'est posé : il vivra dans Stripe.
--
-- Droits : table fermée dès la création (le droit de TABLE écrase la RLS), accès uniquement par des
-- fonctions `security definer` qui retrouvent le lien à partir du compte connecté : aucune ne prend
-- d'identifiant de lien venu de l'appelant, sauf la fonction d'administration (clé de service).

create table public.boutique_abonnements (
  lien_id uuid primary key references public.boutique_liens(id) on delete cascade,
  -- 'aucun' : pas d'abonnement ; 'offert' : accès offert (voir la date) ; 'actif' / 'en_retard' / 'resilie' : Stripe.
  statut text not null default 'aucun'
    check (statut in ('aucun', 'offert', 'actif', 'en_retard', 'resilie')),
  acces_offert_jusqu_au date,
  acces_offert_motif text check (acces_offert_motif is null or char_length(acces_offert_motif) <= 200),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  abonnement_prix_centimes integer check (abonnement_prix_centimes is null or abonnement_prix_centimes >= 0),
  abonnement_frequence text check (abonnement_frequence is null or abonnement_frequence in ('mensuel', 'annuel')),
  abonnement_fin date,
  abonnement_annule boolean not null default false, -- résiliation programmée : le statut Stripe reste « actif » jusqu'au bout
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger boutique_abonnements_updated_at before update on public.boutique_abonnements
  for each row execute function public.set_updated_at();

alter table public.boutique_abonnements enable row level security;
-- Aucune policy : seules les fonctions `security definer` et la clé de service y accèdent.
revoke all on public.boutique_abonnements from public, anon, authenticated;

-- --- Lecture par la boutique connectée --------------------------------------------------------------
-- Le lien est retrouvé depuis `auth.uid()` (boutique_compte_lien, interne depuis 0070). Sans ligne : « aucun ».
create function public.mon_abonnement_boutique()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_lien uuid;
  r public.boutique_abonnements%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('erreur', 'non_connecte'); end if;

  select c.lien_id into v_lien from public.boutique_compte_lien() c;
  if v_lien is null then return jsonb_build_object('erreur', 'pas_un_compte_boutique'); end if;

  select * into r from public.boutique_abonnements a where a.lien_id = v_lien;
  if not found then
    return jsonb_build_object('ok', true, 'statut', 'aucun', 'acces_offert', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'statut', r.statut,
    'acces_offert', coalesce(r.acces_offert_jusqu_au >= current_date, false),
    'acces_offert_jusqu_au', r.acces_offert_jusqu_au,
    'prix_centimes', r.abonnement_prix_centimes,
    'frequence', r.abonnement_frequence,
    'fin', r.abonnement_fin,
    'annule', r.abonnement_annule);
end;
$$;

-- --- Offrir l'accès : administration seulement ------------------------------------------------------
-- Pose « N mois d'accès offert » À PARTIR D'AUJOURD'HUI : à lancer le jour de l'ouverture RÉELLE de
-- l'abonnement (pas à la signature). Ne touche jamais un abonnement payant en cours.
create function public.offrir_acces_boutique(p_lien uuid, p_mois integer default 3, p_motif text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jusqua date;
  r public.boutique_abonnements%rowtype;
begin
  if p_mois is null or p_mois < 1 or p_mois > 12 then
    return jsonb_build_object('erreur', 'duree_invalide');
  end if;
  if not exists (select 1 from public.boutique_liens l where l.id = p_lien) then
    return jsonb_build_object('erreur', 'lien_inconnu');
  end if;

  select * into r from public.boutique_abonnements a where a.lien_id = p_lien for update;
  if found and r.statut in ('actif', 'en_retard') then
    return jsonb_build_object('erreur', 'abonnement_payant_en_cours');
  end if;

  v_jusqua := (current_date + make_interval(months => p_mois))::date;

  insert into public.boutique_abonnements (lien_id, statut, acces_offert_jusqu_au, acces_offert_motif)
  values (p_lien, 'offert', v_jusqua, nullif(btrim(p_motif), ''))
  on conflict (lien_id) do update
    set statut = 'offert', acces_offert_jusqu_au = excluded.acces_offert_jusqu_au,
        acces_offert_motif = excluded.acces_offert_motif;

  return jsonb_build_object('ok', true, 'lien', p_lien, 'acces_offert_jusqu_au', v_jusqua);
end;
$$;

-- `revoke` explicite : Supabase accorde EXECUTE à anon et authenticated à toute fonction créée dans `public`.
revoke all on function public.mon_abonnement_boutique() from public, anon, authenticated;
revoke all on function public.offrir_acces_boutique(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.mon_abonnement_boutique() to authenticated, service_role;
grant execute on function public.offrir_acces_boutique(uuid, integer, text) to service_role;
