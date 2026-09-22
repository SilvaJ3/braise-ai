-- 0049 — L'abonnement Stripe sur le compte.
--
-- Le plan commercial (`plan` : essai / fondateur / mensuel / annuel) est décidé à l'invitation : il
-- dit ce à quoi la personne a droit. Ces colonnes-ci disent **où en est le paiement**, ce qui est une
-- autre question — un compte peut être fondateur et avoir un prélèvement en échec.
--
-- Rien n'est dupliqué depuis Stripe : l'identifiant du client et celui de l'abonnement suffisent à
-- tout retrouver, et ce sont eux qui font foi. Les trois autres colonnes existent pour que l'écran
-- n'ait pas à interroger Stripe à chaque affichage.

alter table public.assistant_profil
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  -- aucun   : jamais rien payé (compte ouvert sur invitation)
  -- actif   : abonnement en cours
  -- en_retard : un prélèvement a échoué, Stripe relance
  -- resilie : l'abonnement est terminé
  add column if not exists abonnement_statut text not null default 'aucun',
  add column if not exists abonnement_fin timestamptz,
  -- Ce qui est réellement prélevé, en centimes : 2900 pour un fondateur, 3900 pour un mensuel, et
  -- 3900 de nouveau quand le coupon fondateur a expiré. Stripe reste la source, c'est un raccourci
  -- d'affichage — et c'est la ligne qui permet de vérifier qu'un fondateur paie bien 29 €.
  add column if not exists abonnement_prix_centimes int;

alter table public.assistant_profil
  add constraint assistant_profil_abonnement_statut_valide
    check (abonnement_statut in ('aucun', 'actif', 'en_retard', 'resilie'));

-- Un client Stripe appartient à un seul compte, et on le retrouve par cet identifiant à chaque
-- événement de webhook.
create unique index if not exists assistant_profil_stripe_customer_idx
  on public.assistant_profil (stripe_customer_id)
  where stripe_customer_id is not null;
