# Checkout Studio — ce qui a été appliqué, et ce qui reste à faire

**Date** : 02/10/2026 · **Scénario** : A — un appel `stripe.checkout.sessions.create(...)` existait déjà.
**Branche** : `checkout-studio` · **Déployé** : non (l'edge function part en production sur ton accord).

L'appel modifié est le seul endroit du dépôt qui crée une session de paiement :
[`supabase/functions/stripe-checkout/index.ts`](supabase/functions/stripe-checkout/index.ts) — deux appels
(abonnement, pack de jetons). Aucun autre fichier n'a été touché, aucune route, aucun déplacement de code.

---

## Values to Replace

**Rien à remplacer.** Les trois paramètres `sample_only` portent déjà de vraies valeurs dans le code :

| Champ | Valeur en place | Ce que c'est |
|-------|-----------------|--------------|
| `mode` | `'payment'` (pack) / `'subscription'` (abonnement) | déjà le bon mode pour chaque produit |
| `success_url` | `\`${url}/compte/mon-compte?paiement=…\`` | vraie page de retour de l'app, adresse lue en base (`reglages_produit.app_url`) |
| `cancel_url` | `\`${url}/compte/mon-compte?paiement=annule\`` | vraie page d'annulation |
| `line_items[].price` | `prixPour(frequence, ids!)` et `prixPack(pack, idsPacks!)` | vrais identifiants de prix, lus dans les secrets Supabase |

Aucun `price_...`, aucune URL d'exemple : rien à remplacer avant la mise en ligne.

---

## Configured Parameters

Fichier : [`supabase/functions/stripe-checkout/index.ts`](supabase/functions/stripe-checkout/index.ts)

| Parameter | Value | Où |
|-----------|-------|----|
| `ui_mode` | `hosted_page` | bloc `reglagesStudio`, les deux appels |
| `billing_address_collection` | `auto` | bloc `reglagesStudio`, les deux appels |
| `phone_number_collection` | `{ enabled: false }` | bloc `reglagesStudio`, les deux appels |
| `automatic_tax` | `{ enabled: true }` | bloc `reglagesStudio` **et** `fiscalite` (même valeur) |
| `allow_promotion_codes` | `true` | pack : direct ; abonnement : **hors compte fondateur** (voir plus bas) |
| `payment_method_collection` | `always` | **abonnement seulement** (règle : jamais en mode `payment`) |
| `submit_type` | `auto` | bloc `reglagesStudio`, les deux appels |
| `saved_payment_method_options` | `{ payment_method_save: 'enabled' }` | bloc `reglagesStudio`, les deux appels |
| `integration_identifier` | `hosted_web_0001` | bloc `reglagesStudio`, les deux appels |
| `origin_context` | `web` | bloc `reglagesStudio`, les deux appels |

### Deux points mesurés à l'API, pas supposés

1. **`ui_mode` : `hosted` est refusé, `hosted_page` est obligatoire.** Le SDK installé est
   `npm:stripe@17` (17.7.0), donc sous la barre des 21.0.0 — mais l'API répond
   *« The ui_mode value `hosted` is no longer supported. Use `hosted_page` instead. »* (400).
   Les types de `stripe@17` ne connaissent que `'embedded' | 'hosted'` : le bloc est donc passé
   **hors typage** (`as unknown as Stripe.Checkout.SessionCreateParams`) plutôt que de forcer une
   montée de version du SDK. `integration_identifier` et `origin_context`, absents des types de 17,
   sont acceptés par l'API (200) et passent par le même bloc.

2. **Codes promo et remise fondateur s'excluent.** *« You may only specify one of these parameters:
   allow_promotion_codes, discounts »* (400). Les deux étaient demandés : `allow_promotion_codes: true`
   (Checkout Studio) et la remise automatique des comptes `fondateur`. Le code garde donc la remise
   pour un compte fondateur — c'est le prix annoncé — et ouvre les codes promo aux autres.
   **Si tu préfères que les codes promo s'appliquent à tout le monde**, il faut retirer la remise
   fondateur automatique : dis-le, c'est une ligne.

### Contraintes Stripe à connaître (mesurées)

- `saved_payment_method_options` **exige un client Stripe attaché** : sans `customer`, l'API répond
  *« requires a customer »*. Le code attache déjà le client (`stripe_customers`) — rien à faire.
- `automatic_tax` **exige une adresse valide sur le client**, ou `customer_update[address] = 'auto'`.
  Le code porte déjà `customer_update` — rien à faire.
- `payment_method_collection` n'est pas envoyé en mode `payment` (le pack), conformément à la règle.

---

## Webhooks — déjà couverts, mesuré le 02/10/2026

Le gestionnaire demandé par la documentation existe déjà et traite **tous les événements
recommandés** — rien à ajouter : [`supabase/functions/stripe-webhook/index.ts`](supabase/functions/stripe-webhook/index.ts)
couvre `checkout.session.completed` (+ `checkout.session.async_payment_succeeded`),
`customer.subscription.created|updated|deleted`, `invoice.paid` et `invoice.payment_failed`.

L'endpoint **en mode test** est en place, lu à l'API (clé de test) :

| Endpoint | URL | État | Événements |
|---|---|---|---|
| `we_1UHM2K…T78Gmi` | `https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/stripe-webhook` | `enabled` | les 6 ci-dessus |

**Ce qui n'est pas prouvé** : la même lecture en **mode production** demande la clé live, qui n'est
pas sur cette machine. À vérifier dans le tableau de bord (Développeurs → Webhooks) que l'endpoint
live porte bien ces événements — sinon une échéance d'abonnement échouée passerait inaperçue.

## Version d'API — volontairement non épinglée

Le code initialise le client sans version (`new Stripe(cle)`) : l'appel suit donc la version par
défaut du compte. La console Checkout Studio affiche, elle, un en-tête `stripe-version: 2026-08-26.dahlia`.
Épingler cette version est **une décision, pas une formalité** : elle change le contrat de toutes les
réponses Stripe d'un coup. Constat qui rassure : le compte répond déjà comme une version récente —
il refuse `ui_mode: hosted` en exigeant `hosted_page`, exactement ce que Studio configure.
Pour épingler : `new Stripe(cle, { apiVersion: '2026-08-26.dahlia' })` — une ligne, quand tu veux.

## Setup and next steps

### Variables d'environnement

Aucune nouvelle variable. Le Checkout est **hébergé par Stripe** : la carte ne traverse jamais l'app,
donc **aucune clé publique n'est nécessaire** et rien n'a à être préfixé `VITE_`.

Déjà en place côté Supabase (secrets de l'edge function `stripe-checkout`) :
`STRIPE_SECRET_KEY`, `STRIPE_PRIX_MENSUEL`, `STRIPE_PRIX_ANNUEL`, `STRIPE_COUPON_FONDATEUR`,
`STRIPE_PRIX_PACK_30`, `STRIPE_PRIX_PACK_50`, `STRIPE_WEBHOOK_SECRET`.
En local, `.env.local` ne porte que `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRIX_MENSUEL`,
`STRIPE_PRIX_ANNUEL`, `STRIPE_COUPON_FONDATEUR` — les deux prix de pack n'y sont pas, ce qui n'empêche
pas l'abonnement de fonctionner.

### Ce qui reste à faire dans le tableau de bord Stripe

Sans ces deux réglages, **Stripe Tax calcule 0 €** : le siège de l'entreprise, et l'enregistrement du
numéro de TVA belge. C'est indépendant de ce changement de code.

### TVA et facturation belge — réponse d'Accountable (04/10/2026)

Pas un avis fiscal : les points marqués « à valider » le restent. N° de TVA BE1043060596, début d'activité 26/09/2026.

**Appliqué dans le code**
- `billing_address_collection: 'required'` (`stripe-checkout`, `stripe-checkout-boutique`) : adresse collectée dès
  Checkout, pour que la première vraie facture soit correcte (l'essai de 7 jours ne produit qu'une facture à 0 €).
- Déjà en place : `automatic_tax`, `tax_id_collection`, essai via `trial_end`.

**Règles retenues**
- Belgique : 21 % pour tous les clients. 49 € HT = 59,29 € TTC ; afficher 49 € TTC exige un prix inclusif (40,50 € HT + 8,50 € TVA).
- B2B UE avec n° de TVA valide (VIES, garder la preuve) : 0 % + « Autoliquidation ». N° invalide : traité comme un particulier.
- B2C UE : TVA belge sous 10 000 €/an de ventes dans les autres pays UE, puis TVA du pays du client via l'OSS.
- Hors UE : B2B hors champ (garder la preuve de la qualité pro) ; B2C hors UE à ne pas ouvrir au départ.
- Remise sur la 1re facture : TVA sur le montant après remise (49 − 10 = 39 € HT, 8,19 € de TVA, 47,19 € TTC).
- Note de crédit pour tout remboursement/annulation : référence la facture d'origine, même taux de TVA. Pas de règle de prorata connue.
- Numérotation continue sans trou ; conservation 10 ans.

**À faire / à valider avant la mise en production**
- [ ] Décider prix HT ou TTC (`tax_behavior`) côté Stripe, puis aligner les textes de l'app.
- [ ] Code fiscal du produit : `txcd_10103001` (SaaS professionnel), non confirmé par Accountable.
- [ ] Peppol (obligatoire depuis le 01/01/2026 pour le B2B belge) : les factures Stripe suffisent-elles ? Sinon un outil Peppol en plus.
- [ ] Limiter les pays de Checkout pour ne pas ouvrir le B2C hors UE par accident.
- [ ] Flux contestation/remboursement : l'aligner sur la note de crédit.
- [ ] Mentions légales exactes (autoliquidation, « hors champ »), grilles de déclaration TVA, listing intracommunautaire.
- [ ] Structure juridique : indépendant complémentaire ou société (guichet d'entreprises / comptable).

### Structure des fichiers

- [`supabase/functions/stripe-checkout/index.ts`](supabase/functions/stripe-checkout/index.ts) — modifié, seul fichier touché.
- `STRIPE_INTEGRATION_TODO.md` — ce fichier.

### Comment le parcours fonctionne

1. L'artisan clique « S'abonner » (ou achète un pack) dans `Compte → Mon compte`.
2. L'app appelle l'edge function `stripe-checkout` (POST) ; le compte est lu depuis le jeton de session.
3. La fonction crée — ou réutilise — le client Stripe du compte, puis crée la **session hébergée**
   (abonnement : essai de 7 jours avec carte ; pack : paiement unique) et renvoie `session.url`.
4. Le navigateur suit cette adresse : c'est Stripe qui affiche la page de paiement.
5. Au retour, l'app relit le compte ; `stripe-webhook` reçoit l'événement et met le compte à jour.

### Cartes de test (mode test uniquement)

- `4242 4242 4242 4242` — paiement accepté.
- `4000 0025 0000 3155` — exige une authentification 3D Secure.
- `4000 0000 0000 9995` — refus pour fonds insuffisants.
- `4000 0000 0000 0341` — échoue après attachement (utile pour éprouver les échecs de webhook).
Date d'expiration future quelconque, CVC quelconque. Les identifiants de test et de production sont
séparés : rien de ce qui est essayé en mode test ne touche les vrais paiements.

### Prochaines étapes

- [ ] Faire relire la branche `checkout-studio`, puis la déployer (`supabase functions deploy stripe-checkout`).
- [ ] Éprouver un vrai parcours en mode test : abonnement (essai 7 jours), puis pack de jetons.
- [ ] Poser le siège et le numéro de TVA belge dans Stripe (sinon taxe à 0 €).
- [ ] Vérifier la réception de `checkout.session.completed` côté `stripe-webhook` après déploiement.

### Ressources

- Support : https://support.stripe.com
- Documentation : https://docs.stripe.com/mcp
