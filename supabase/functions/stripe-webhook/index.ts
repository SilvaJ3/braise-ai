// Le retour de Stripe : ce qui tient le compte à jour.
//
// Stripe appelle cette fonction à chaque changement d'abonnement. On n'y fait qu'une chose : écrire
// sur le compte ce que Stripe dit de l'abonnement — statut, fin de période, montant réellement
// prélevé. Aucune restriction d'accès n'est appliquée ici : couper l'accès d'un artisan parce qu'un
// prélèvement a échoué est une décision commerciale, pas une conséquence technique.
//
// À déployer avec `--no-verify-jwt` : Stripe n'envoie évidemment pas de jeton Supabase. C'est la
// signature du webhook qui prouve que l'appel vient bien de Stripe.
//
// Secret attendu : STRIPE_WEBHOOK_SECRET.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { champsDepuisAbonnement, prendLeCompte } from '../_shared/stripe.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

/** Écrit l'état de l'abonnement sur le compte, retrouvé par son client Stripe. */
async function majDepuisAbonnement(stripe: Stripe, abonnementId: string, userIdConnu?: string | null) {
  const sub = await stripe.subscriptions.retrieve(abonnementId, { expand: ['discount'] })
  const champs = champsDepuisAbonnement(
    sub as unknown as Parameters<typeof champsDepuisAbonnement>[0],
  )

  // Le compte est retrouvé par l'identifiant du client Stripe — c'est le lien posé au paiement.
  const clientId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  let userId = userIdConnu ?? null
  let suivi: string | null = null
  if (clientId) {
    const { data } = await admin
      .from('assistant_profil')
      .select('user_id, stripe_subscription_id')
      .eq('stripe_customer_id', clientId)
      .maybeSingle()
    if (data) {
      userId = userId ?? ((data.user_id as string | undefined) ?? null)
      suivi = (data.stripe_subscription_id as string | null) ?? null
    }
  }
  if (!userId && clientId) {
    console.error('[stripe-webhook] aucun compte pour ce client', clientId, sub.id)
    return
  }
  if (!userId) {
    console.error('[stripe-webhook] abonnement sans compte identifiable', sub.id)
    return
  }

  // Un abonnement qui n'a pas sa place sur le compte n'y écrit rien (voir `prendLeCompte`).
  if (!prendLeCompte(sub, suivi)) {
    console.log('[stripe-webhook] écarté', sub.id, sub.status, '| le compte suit', suivi ?? 'aucun')
    return
  }

  const { error } = await admin
    .from('assistant_profil')
    .update({ ...champs, stripe_customer_id: clientId ?? undefined })
    .eq('user_id', userId)
  if (error) console.error('[stripe-webhook] écriture du compte', error)
  else console.log('[stripe-webhook]', sub.id, champs.abonnement_statut, champs.abonnement_prix_centimes)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('méthode non autorisée', { status: 405 })

  const cle = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim()
  if (!cle || !secret) {
    console.error('[stripe-webhook] secrets manquants')
    return new Response('non configuré', { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('signature absente', { status: 400 })

  // Le corps doit être lu brut : la signature porte sur les octets reçus, pas sur du JSON reformaté.
  const brut = await req.text()

  const stripe = new Stripe(cle)
  let evenement: Stripe.Event
  try {
    evenement = await stripe.webhooks.constructEventAsync(brut, signature, secret)
  } catch (e) {
    console.error('[stripe-webhook] signature invalide', e)
    return new Response('signature invalide', { status: 400 })
  }

  try {
    switch (evenement.type) {
      case 'checkout.session.completed': {
        const session = evenement.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const abonnementId =
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          await majDepuisAbonnement(stripe, abonnementId, session.client_reference_id)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = evenement.data.object as Stripe.Subscription
        await majDepuisAbonnement(stripe, sub.id)
        break
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        // Les deux cas mettent à jour le même abonnement : le statut y est déjà à jour chez Stripe.
        const facture = evenement.data.object as Stripe.Invoice
        const abonnement = (facture as unknown as { subscription?: string | { id: string } | null })
          .subscription
        if (abonnement) {
          const id = typeof abonnement === 'string' ? abonnement : abonnement.id
          await majDepuisAbonnement(stripe, id)
        }
        break
      }
      default:
        // Les autres événements ne concernent pas le compte : on les ignore volontairement.
        break
    }
  } catch (e) {
    // On répond quand même 200 : Stripe rejouerait un événement qu'on a déjà accepté, et une erreur
    // de notre côté ne doit pas se transformer en tempête de réessais.
    console.error('[stripe-webhook] traitement', evenement.type, e)
  }

  return new Response('ok', { status: 200 })
})
