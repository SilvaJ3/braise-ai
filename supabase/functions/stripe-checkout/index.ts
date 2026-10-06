// Abonnement Braaise : crée une session de paiement Stripe pour le compte connecté.
//
// Deux choses s'achètent ici, et elles ne se paient pas de la même façon :
//   · l'abonnement (mensuel ou annuel) — `mode: 'subscription'`, prix récurrent, coupon fondateur
//     appliqué aux comptes `fondateur` sur le mensuel ;
//   · un pack de jetons — `mode: 'payment'`, paiement unique, qui ajoute des jetons à l'enveloppe
//     du mois sans rien changer au plan.
//
// Le Checkout est hébergé par Stripe : la carte ne traverse jamais notre code, et l'application n'a
// donc pas besoin de clé publique.
//
// La TVA : ACTIVE depuis le 02/10/2026 (immatriculation confirmée, assujetti au régime normal).
// `automatic_tax` est donc ouvert — les prix se lisent HTVA et 21 % s'ajoutent. Deux réglages
// restent à poser dans le tableau de bord Stripe, et sans eux la taxe calculée vaut 0 € : le siège
// de l'entreprise et l'enregistrement du numéro de TVA belge.
// `tax_id_collection` garde le numéro de TVA du client professionnel pour l'autoliquidation hors
// Belgique.
//
// L'essai de sept jours s'ouvre ICI, avec la carte (`trial_period_days`, carte exigée), et une
// seule fois par compte (02/10/2026) : voir `_shared/essai.ts` pour la règle.
//
// Un client Stripe est créé au premier paiement puis réutilisé : c'est lui qui permet au webhook de
// retrouver le compte.
//
// Secrets attendus : STRIPE_SECRET_KEY, STRIPE_PRIX_MENSUEL, STRIPE_PRIX_ANNUEL,
// STRIPE_COUPON_FONDATEUR, STRIPE_PRIX_PACK_30, STRIPE_PRIX_PACK_50,
// STRIPE_PRIX_BOUTIQUE_MENSUEL, STRIPE_PRIX_BOUTIQUE_ANNUEL (comptes boutique, 49 / 490 € HTVA).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import {
  appliqueCouponFondateur,
  frequenceValide,
  prixPour,
  DECLARATION_PROFESSIONNELLE_REQUISE,
  DECLARATION_PROFESSIONNELLE,
  type IdentifiantsStripe,
} from '../_shared/stripe.ts'
import { abonnementOuvreAcces, ESSAI_JOURS } from '../_shared/essai.ts'
import { metadonneesPack, packValide, prixPack, type IdentifiantsPacks } from '../_shared/packs.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

/** Les identifiants Stripe vivent en secrets. S'il en manque un, on ne devine pas : on refuse. */
function identifiants(): IdentifiantsStripe | null {
  const prixMensuel = Deno.env.get('STRIPE_PRIX_MENSUEL')?.trim()
  const prixAnnuel = Deno.env.get('STRIPE_PRIX_ANNUEL')?.trim()
  const couponFondateur = Deno.env.get('STRIPE_COUPON_FONDATEUR')?.trim()
  if (!prixMensuel || !prixAnnuel || !couponFondateur) return null
  return {
    prixMensuel,
    prixAnnuel,
    couponFondateur,
    boutiqueMensuel: Deno.env.get('STRIPE_PRIX_BOUTIQUE_MENSUEL')?.trim() || undefined,
    boutiqueAnnuel: Deno.env.get('STRIPE_PRIX_BOUTIQUE_ANNUEL')?.trim() || undefined,
  }
}

/**
 * Les deux prix des packs, à part de ceux de l'abonnement : un déploiement qui n'a pas encore les
 * secrets des packs vend l'abonnement comme avant, au lieu de tout refuser. C'est la vente des
 * packs qui est fermée, pas le paiement.
 */
function identifiantsPacks(): IdentifiantsPacks | null {
  const pack30 = Deno.env.get('STRIPE_PRIX_PACK_30')?.trim()
  const pack50 = Deno.env.get('STRIPE_PRIX_PACK_50')?.trim()
  if (!pack30 || !pack50) return null
  return { pack30, pack50 }
}

/** L'adresse de l'application, réglée en base (`app_url`) — jamais en dur dans le code. */
async function adresseApp(): Promise<string> {
  const { data } = await admin
    .from('reglages_produit')
    .select('valeur')
    .eq('cle', 'app_url')
    .maybeSingle()
  const lue = typeof data?.valeur === 'string' ? data.valeur.trim() : ''
  return (lue || 'https://artisan.braaise.io').replace(/\/+$/, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erreur: 'méthode non autorisée' }, 405)

  const cle = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
  const ids = identifiants()
  const idsPacks = identifiantsPacks()
  if (!cle) {
    console.error('[stripe-checkout] secrets manquants')
    return json({ erreur: 'Le paiement n’est pas disponible pour le moment.' }, 503)
  }

  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: erreurAuth } = await admin.auth.getUser(jeton)
  if (erreurAuth || !auth?.user) return json({ erreur: 'non authentifié' }, 401)
  const utilisateur = auth.user

  const corps = (await req.json().catch(() => ({}))) as {
    frequence?: unknown
    pack?: unknown
    /**
     * La déclaration d'usage professionnel, cochée à l'écran. Braaise est réservé aux
     * professionnels : un consommateur a un droit de rétractation de quatorze jours
     * (art. VI.47 CDE) qu'on ne peut pas lui faire abandonner par une case à cocher.
     * On recueille donc la qualité du souscripteur, et on refuse un abonnement sans elle.
     */
    usage_professionnel?: unknown
  }
  const frequence = frequenceValide(corps?.frequence)
  // Un identifiant de pack inconnu ne retombe sur rien : on refuse au lieu de vendre autre chose.
  const pack = corps?.pack === undefined ? null : packValide(corps.pack)
  if (corps?.pack !== undefined && !pack) return json({ erreur: 'pack inconnu' }, 400)
  // Ce qui manque dépend de ce qui s'achète : les prix des packs pour un pack, ceux de
  // l'abonnement sinon.
  if (pack ? !idsPacks : !ids) {
    console.error('[stripe-checkout] secrets manquants pour', pack ?? frequence)
    return json({ erreur: 'Le paiement n’est pas disponible pour le moment.' }, 503)
  }

  const { data: profil } = await admin
    .from('assistant_profil')
    .select('plan, stripe_customer_id, stripe_subscription_id, abonnement_statut')
    .eq('user_id', utilisateur.id)
    .maybeSingle()

  // Un compte boutique (migration 0067 : `boutique_liens.compte_id`) paie le tarif boutique et n'a
  // jamais le tarif fondateur. Son état d'abonnement vit dans `assistant_profil` comme celui d'un
  // artisan : la ligne est créée si elle manque (les écritures plus bas ne toucheraient rien).
  const { data: lienBoutique } = await admin
    .from('boutique_liens')
    .select('id')
    .eq('compte_id', utilisateur.id)
    .eq('actif', true)
    .maybeSingle()
  const boutique = Boolean(lienBoutique)
  // L'abonnement d'une boutique s'ouvre ailleurs (`stripe-checkout-boutique`, état dans
  // `boutique_abonnements`, 0082) : ici il atterrirait dans `assistant_profil`, et une boutique n'y
  // écrit jamais. Un pack de jetons, lui, reste permis.
  if (boutique && !pack) {
    return json({ erreur: 'L’abonnement d’une boutique se règle depuis l’espace boutique.' }, 409)
  }
  const prix = pack ? null : prixPour(frequence, ids!, boutique)
  if (!pack && !prix) {
    console.error('[stripe-checkout] prix manquant pour', boutique ? 'boutique' : 'artisan', frequence)
    return json({ erreur: 'Le paiement n’est pas disponible pour le moment.' }, 503)
  }
  if (boutique && !profil) {
    await admin.from('assistant_profil').upsert({ user_id: utilisateur.id }, { onConflict: 'user_id', ignoreDuplicates: true })
  }

  // Un compte déjà en abonnement (ou en essai) n'en ouvre pas un second : il gère le sien depuis
  // « Mon compte ». Sans cette garde, un clic de trop créait deux abonnements chez Stripe, et la
  // personne était prélevée deux fois.
  const dejaAbonne = abonnementOuvreAcces(profil?.abonnement_statut)
  if (!pack && dejaAbonne) {
    return json({ erreur: 'Ton abonnement est déjà en cours : gère-le depuis « Mon compte ».' }, 409)
  }

  // L'essai de sept jours s'ouvre UNE fois, avec la carte (décision du 02/10/2026). Le repère est
  // l'abonnement Stripe déjà rattaché au compte : un compte qui a déjà eu le sien paie tout de
  // suite. Un essai qui se rouvrirait à chaque passage ne serait plus un essai.
  const premierEssai = !pack && !profil?.stripe_subscription_id

  // La qualité du souscripteur (décision du 06/10/2026). Braaise s'adresse aux professionnels :
  // l'artisan ou la boutique qui s'abonne agit pour son activité, pas à titre privé. Le droit de
  // rétractation que le CDE réserve au consommateur ne s'applique donc pas — et c'est cette
  // déclaration qui le constate, au lieu d'une renonciation qu'on ne peut pas imposer à un
  // consommateur. Cette fonction REFUSE un abonnement sans elle.
  const professionnel = corps?.usage_professionnel === true
  if (!pack && !professionnel) return json({ erreur: DECLARATION_PROFESSIONNELLE_REQUISE, professionnel: true }, 400)

  // `ui_mode: 'hosted_page'` (Checkout Studio) n'existe qu'à partir de cette version d'API ; les
  // types de stripe@17 ne la connaissent pas, d'où le cast.
  const stripe = new Stripe(cle, { apiVersion: '2026-03-25.dahlia' as never })
  const url = await adresseApp()

  // Un client Stripe par compte, créé à la première demande puis réutilisé.
  let client = (profil?.stripe_customer_id as string | null) ?? null
  if (!client) {
    const cree = await stripe.customers.create({
      email: utilisateur.email ?? undefined,
      metadata: { user_id: utilisateur.id },
    })
    client = cree.id
    const { error } = await admin
      .from('assistant_profil')
      .update({ stripe_customer_id: cree.id })
      .eq('user_id', utilisateur.id)
    if (error) {
      // Sans ce lien, le webhook ne saurait pas à qui rattacher l'abonnement : on s'arrête là.
      console.error('[stripe-checkout] rattachement du client', error)
      return json({ erreur: 'Le paiement n’est pas disponible pour le moment.' }, 503)
    }
  }

  const fondateur = !boutique && appliqueCouponFondateur(profil?.plan, frequence)

  // La TVA est ACTIVE depuis le 02/10/2026 (BCE 1043.060.596 immatriculé, assujetti au régime
  // normal) : les prix se lisent HTVA et 21 % s'ajoutent, c'est Stripe Tax qui les calcule. Deux
  // réglages restent à poser dans le tableau de bord Stripe, et sans eux Stripe Tax calcule 0 € :
  // le siège de l'entreprise et l'enregistrement du numéro de TVA belge.
  // Le recouvrement du numéro de TVA du client vaut pour les deux achats : il permet
  // l'autoliquidation hors Belgique. `customer_update` fait enregistrer l'adresse et le nom sur le
  // client Stripe — sans quoi un client qui existe déjà ne pourrait pas porter son numéro de TVA.
  const fiscalite = {
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    customer_update: { address: 'auto' as const, name: 'auto' as const },
  }

  // La déclaration est DATÉE avant d'ouvrir le paiement, et l'écriture est vérifiée : c'est la
  // preuve que le souscripteur a déclaré sa qualité au moment où il s'est abonné.
  if (!pack && professionnel) {
    const { error } = await admin
      .from('assistant_profil')
      .update({ usage_professionnel_declare_le: new Date().toISOString() })
      .eq('user_id', utilisateur.id)
    if (error) {
      console.error('[stripe-checkout] déclaration non datée', error)
      return json({ erreur: 'Le paiement n’a pas pu être ouvert.' }, 502)
    }
  }

  // Réglages posés dans Checkout Studio (02/10/2026) : ils valent pour les deux achats.
  // Ils passent **hors typage** pour deux raisons mesurées à l'API, pas supposées :
  //   · `ui_mode` — les types de `stripe@17` ne connaissent que `'embedded' | 'hosted'`, alors que
  //     l'API refuse désormais `hosted` : « The ui_mode value `hosted` is no longer supported.
  //     Use `hosted_page` instead. » (400). C'est donc `hosted_page` qu'on envoie.
  //   · `integration_identifier` et `origin_context` — acceptés par l'API (200), absents des types
  //     du SDK. Un objet hors typage évite d'épingler une version d'API ou de SDK.
  const reglagesStudio = {
    ui_mode: 'hosted_page',
    billing_address_collection: 'required',
    phone_number_collection: { enabled: false },
    automatic_tax: { enabled: true },
    submit_type: 'auto',
    // La carte est proposée à l'enregistrement pendant le paiement : le suivant se fait en un clic.
    saved_payment_method_options: { payment_method_save: 'enabled' },
    integration_identifier: 'hosted_web_0001',
    origin_context: 'web',
  } as unknown as Stripe.Checkout.SessionCreateParams

  try {
    const session = pack
      ? await stripe.checkout.sessions.create({
          ...reglagesStudio,
          mode: 'payment',
          customer: client,
          line_items: [{ price: prixPack(pack, idsPacks!), quantity: 1 }],
          ...fiscalite,
          // Le pack ne porte pas de remise automatique : la page peut donc accepter un code.
          allow_promotion_codes: true,
          adaptive_pricing: { enabled: false },
          client_reference_id: utilisateur.id,
          // L'identifiant du compte et le pack voyagent avec la session ET avec le paiement :
          // c'est ce que lit `stripe-webhook` pour créditer. Le nombre de jetons y figure pour la
          // trace, mais il n'est jamais cru sur parole — `_shared/packs.ts` le relit dans la table.
          metadata: metadonneesPack(utilisateur.id, pack),
          payment_intent_data: { metadata: metadonneesPack(utilisateur.id, pack) },
          success_url: `${url}/compte/mon-compte?paiement=pack`,
          cancel_url: `${url}/compte/mon-compte?paiement=annule`,
        })
      : await stripe.checkout.sessions.create({
          ...reglagesStudio,
          mode: 'subscription',
          customer: client,
          line_items: [{ price: prix!, quantity: 1 }],
          ...fiscalite,
          // La carte est exigée MÊME pendant l'essai : c'est elle qui fait du 8e jour un prélèvement
          // et non une décision à prendre. Un essai sans carte laissait l'artisan s'installer dans
          // un outil qu'il ne payait jamais (décision du 02/10/2026).
          payment_method_collection: 'always',
          // Le prix est en euros et doit s'afficher en euros. Sans ce verrou, Stripe adapte la devise
          // au pays qu'il croit deviner chez le visiteur : la page de paiement a affiché « CA$48,45 »
          // pour un prix de 3 900 cents, alors que la base écrivait bien 2 900 (constat du 20/09/2026).
          // Ce qu'on vérifie n'est pas la ligne de code mais la session relue en mode test.
          adaptive_pricing: { enabled: false },
          // Un compte fondateur garde sa remise automatique — c'est le prix qu'on lui a annoncé ;
          // les autres peuvent saisir un code. Les deux ensemble sont refusés par l'API :
          // « You may only specify one of these parameters: allow_promotion_codes, discounts »
          // (400, mesuré le 02/10/2026), d'où le choix exclusif plutôt que deux champs côte à côte.
          ...(fondateur
            ? { discounts: [{ coupon: ids!.couponFondateur }] }
            : { allow_promotion_codes: true }),
          client_reference_id: utilisateur.id,
          subscription_data: {
            metadata: { user_id: utilisateur.id },
            // L'essai s'ouvre UNE fois : un compte qui a déjà eu le sien paie dès le premier jour.
            ...(premierEssai ? { trial_period_days: ESSAI_JOURS } : {}),
          },
          // La phrase est aussi sur la page de paiement : la carte est donnée après l'avoir lue,
          // pas seulement après avoir coché une case chez nous.
          custom_text: { submit: { message: DECLARATION_PROFESSIONNELLE } },
          success_url: `${url}/compte/mon-compte?paiement=${premierEssai ? 'essai' : 'ok'}`,
          cancel_url: `${url}/compte/mon-compte?paiement=annule`,
        })
    if (!session.url) {
      console.error('[stripe-checkout] session sans adresse', session.id)
      return json({ erreur: 'Le paiement n’a pas pu être ouvert.' }, 502)
    }
    return json({ url: session.url })
  } catch (e) {
    console.error('[stripe-checkout] création de la session', e)
    return json({ erreur: 'Le paiement n’a pas pu être ouvert.' }, 502)
  }
})
