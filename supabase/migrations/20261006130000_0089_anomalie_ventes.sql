-- 0089 — Le calcul d'anomalie des ventes : ce qui a décollé, ce qui a décroché.
--
-- Transposition de la méthode « ig-viral » : on ne juge jamais un chiffre en valeur absolue, mais contre
-- la propre ligne de base de l'artisan. Là où le skill divise les vues d'un reel par la médiane des vues du
-- compte, on divise ici les UNITÉS VENDUES d'un article sur 30 jours par la médiane MENSUELLE de ses
-- articles sur 3 mois.
--
-- Aucune table, aucune donnée ajoutée : une fonction qui lit `declarations_ventes` (le journal des ventes
-- déclarées par les boutiques) et `produits` (pour le nom à jour). Les ventes des marchés et du carnet
-- (`marche_lignes`, `commandes`) n'y sont PAS encore : ce sont d'autres sources, à brancher plus tard.
--
-- Les seuils, noir sur blanc (rapport = ventes sur 30 jours ÷ médiane mensuelle) :
--     rapport  > 3     → signal 'haut'      (l'article a décollé)
--     rapport  < 0,5   → signal 'bas'       (l'article a décroché : tout aussi bon à montrer)
--     0,5 à 3 inclus   → 'ordinaire'        (aucune suggestion : proposer un reel serait du bruit)
-- Et un garde-fou d'honnêteté : sous 15 unités vendues au total sur 3 mois, la médiane n'a aucun sens
-- statistique, la fonction répond 'insuffisant' au lieu d'inventer un « 4 fois ta normale ».
--
-- « Médiane mensuelle » : on totalise les unités de chaque article sur 3 mois, on prend la médiane de ces
-- totaux, et on la divise par 3 pour la ramener à un mois (sinon 30 jours seraient comparés à 3 mois).
-- Un article vendu dans les 3 mois mais pas dans les 30 derniers jours sort avec 0 vente : rapport 0, bas.
--
-- Dates : on compte à `declare_le` (le jour où l'envoi est arrivé), pas à `periode` (le mois déclaré, trop
-- grossier pour une fenêtre de 30 jours). Une déclaration `corrigee` est écartée, comme partout ailleurs.
--
-- Quantité d'une ligne : `ventes` (relevés incrémentaux) sinon `quantite` (anciennes déclarations), lue
-- avec le même format strict que `boutique_quantite` (0087) — recopié ici pour ne pas dépendre de cette
-- migration : une valeur illisible vaut 0, jamais NaN.
--
-- security INVOKER : exécutée par un artisan, la RLS ne lui montre que ses lignes. Seul `service_role` (le
-- bilan hebdomadaire, côté serveur) peut l'appeler ; anon, authenticated et PUBLIC n'y ont pas accès (voir
-- 0086 : un droit implicite de PUBLIC survit à un revoke visant seulement anon).
--
-- Pour revenir en arrière : drop function public.anomalies_ventes(uuid);

create or replace function public.anomalies_ventes(p_user uuid)
returns table (
  produit_id uuid,
  designation text,
  ventes_30j numeric,
  mediane_mensuelle numeric,
  rapport numeric,
  signal text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with lignes as (
    select
      nullif(l->>'produit_id', '')::uuid as produit_id,
      coalesce('produit:' || nullif(l->>'produit_id', ''), 'nom:' || lower(btrim(l->>'designation'))) as cle,
      l->>'designation' as designation,
      dv.declare_le,
      case when coalesce(l->>'ventes', l->>'quantite') ~ '^[0-9]{1,6}(\.[0-9]{1,2})?$'
           then coalesce(l->>'ventes', l->>'quantite')::numeric else 0 end as quantite
    from public.declarations_ventes dv, lateral jsonb_array_elements(dv.lignes) as l
    where dv.user_id = p_user
      and dv.statut <> 'corrigee'
      and dv.declare_le >= now() - interval '3 months'
  ),
  par_article as (
    select
      cle,
      max(produit_id::text)::uuid as produit_id,
      max(designation) as designation,
      sum(quantite) as ventes_3m,
      coalesce(sum(quantite) filter (where declare_le >= now() - interval '30 days'), 0) as ventes_30j
    from lignes
    group by cle
    having sum(quantite) > 0
  ),
  base as (
    select
      (percentile_cont(0.5) within group (order by ventes_3m))::numeric / 3 as mediane_mensuelle,
      sum(ventes_3m) as total_3m
    from par_article
  )
  select
    a.produit_id,
    coalesce(p.nom, a.designation) as designation,
    a.ventes_30j,
    round(b.mediane_mensuelle, 2) as mediane_mensuelle,
    round(a.ventes_30j / b.mediane_mensuelle, 2) as rapport,
    case
      when b.total_3m < 15 then 'insuffisant'
      when a.ventes_30j / b.mediane_mensuelle > 3 then 'haut'
      when a.ventes_30j / b.mediane_mensuelle < 0.5 then 'bas'
      else 'ordinaire'
    end as signal
  from par_article a
  cross join base b
  left join public.produits p on p.id = a.produit_id and p.user_id = p_user
  order by a.ventes_30j / b.mediane_mensuelle desc, 2
$$;

revoke all on function public.anomalies_ventes(uuid) from public, anon, authenticated;
grant execute on function public.anomalies_ventes(uuid) to service_role;
