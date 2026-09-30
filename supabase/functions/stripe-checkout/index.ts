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
// La TVA : elle sera normale (21 % en Belgique) le jour où l'identification sera ACTIVE. Tant
// qu'elle ne l'est pas (30/09), `automatic_tax` est FERMÉ : un abonnement payé porterait une TVA
// que l'entreprise ne pourrait pas déclarer. Le jour de l'activation, repasser ce drapeau à `true`
// (une ligne) et remettre la TVA au paiement.
// `tax_id_collection` reste ouvert : il ne prélève rien, il garde le numéro de TVA du client
// professionnel pour l'autoliquidation hors Belgique.
//
// Un client Stripe est créé au premier paiement puis réutilisé : c'est lui qui permet au webhook de
// retrouver le compte.
//
// Secrets attendus : STRIPE_SECRET_KEY, STRIPE_PRIX_MENSUEL, STRIPE_PRIX_ANNUEL,
// STRIPE_COUPON_FONDATEUR, STRIPE_PRIX_PACK_30, STRIPE_PRIX_PACK_50.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import {
  appliqueCouponFondateur,
  frequenceValide,
  prixPour,
  type IdentifiantsStripe,
} from '../_shared/stripe.ts'
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
  return { prixMensuel, prixAnnuel, couponFondateur }
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
  return (lue || 'https://braise-ai.vercel.app').replace(/\/+$/, '')
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

  const corps = (await req.json().catch(() => ({}))) as { frequence?: unknown; pack?: unknown }
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
    .select('plan, stripe_customer_id')
    .eq('user_id', utilisateur.id)
    .maybeSingle()

  const stripe = new Stripe(cle)
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

  const fondateur = appliqueCouponFondateur(profil?.plan, frequence)

  // La TVA et le recouvrement du numéro de TVA valent pour les deux achats : la TVA belge (21 %)
  // s'ajoute au montant, et le numéro du client professionnel permet l'autoliquidation hors
  // Belgique. `customer_update` fait enregistrer l'adresse et le nom sur le client Stripe —
  // sans quoi un client qui existe déjà ne pourrait pas porter son numéro de TVA.
  const fiscalite = {
    automatic_tax: { enabled: false },
    tax_id_collection: { enabled: true },
    customer_update: { address: 'auto' as const, name: 'auto' as const },
  }

  try {
    const session = pack
      ? await stripe.checkout.sessions.create({
          mode: 'payment',
          customer: client,
          line_items: [{ price: prixPack(pack, idsPacks!), quantity: 1 }],
          ...fiscalite,
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
          mode: 'subscription',
          customer: client,
          line_items: [{ price: prixPour(frequence, ids!), quantity: 1 }],
          ...fiscalite,
          // Le prix est en euros et doit s'afficher en euros. Sans ce verrou, Stripe adapte la devise
          // au pays qu'il croit deviner chez le visiteur : la page de paiement a affiché « CA$48,45 »
          // pour un prix de 3 900 cents, alors que la base écrivait bien 2 900 (constat du 20/09/2026).
          // Ce qu'on vérifie n'est pas la ligne de code mais la session relue en mode test.
          adaptive_pricing: { enabled: false },
          // Le tarif fondateur est appliqué tout seul : il n'y a pas de code à saisir.
          discounts: fondateur ? [{ coupon: ids!.couponFondateur }] : undefined,
          client_reference_id: utilisateur.id,
          subscription_data: { metadata: { user_id: utilisateur.id } },
          success_url: `${url}/compte/mon-compte?paiement=ok`,
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
