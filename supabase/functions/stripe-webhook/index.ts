// Le retour de Stripe : ce qui tient le compte à jour.
//
// Stripe appelle cette fonction à chaque changement d'abonnement, et à chaque achat de pack de
// jetons. On n'y fait que deux choses : écrire sur le compte ce que Stripe dit de l'abonnement, et
// créditer les jetons d'un pack payé. Aucune restriction d'accès n'est appliquée ici : couper
// l'accès d'un artisan parce qu'un prélèvement a échoué est une décision commerciale, pas une
// conséquence technique.
//
// À déployer avec `--no-verify-jwt` : Stripe n'envoie évidemment pas de jeton Supabase. C'est la
// signature du webhook qui prouve que l'appel vient bien de Stripe.
//
// Secret attendu : STRIPE_WEBHOOK_SECRET.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { champsDepuisAbonnement, prendLeCompte } from '../_shared/stripe.ts'
import { clefCredit, creditDepuisSession } from '../_shared/packs.ts'
import {
  boutiquePrendLAbonnement,
  champsBoutiqueDepuisAbonnement,
  cibleDuWebhook,
} from '../_shared/stripe-boutique.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

/** L'identifiant du prix annuel : il sert à écrire la fréquence réelle de l'abonnement (0077). */
const PRIX_ANNUEL = Deno.env.get('STRIPE_PRIX_ANNUEL')?.trim() ?? null
const PRIX_BOUTIQUE_ANNUEL = Deno.env.get('STRIPE_PRIX_BOUTIQUE_ANNUEL')?.trim() ?? null

/** L'identifiant du prix annuel de la BOUTIQUE : il sert à écrire la fréquence réelle de son abonnement. */
const PRIX_BOUTIQUE_ANNUEL = Deno.env.get('STRIPE_PRIX_BOUTIQUE_ANNUEL')?.trim() ?? null

/**
 * Écrit l'état d'un abonnement de BOUTIQUE dans `boutique_abonnements` (0082) — et nulle part ailleurs.
 *
 * Trois protections, parce que le webhook sert aussi les artisans :
 *   · on n'écrit que ce qui a été payé ou déjà suivi (`boutiquePrendLAbonnement`) : une carte refusée
 *     n'efface pas un abonnement en cours ;
 *   · un statut illisible (`aucun`) n'écrase RIEN : il ferait perdre un accès offert encore valable ;
 *   · le client Stripe doit être celui déjà rattaché au lien : un abonnement qui porterait le marquage
 *     d'une autre boutique ne peut pas écrire chez elle.
 * Une valeur absente (fin de période) n'efface pas celle qu'on a déjà : on ne remplace pas une information par du vide.
 */
async function majBoutiqueDepuisAbonnement(sub: Stripe.Subscription, lienId: string) {
  const champs = champsBoutiqueDepuisAbonnement(
    sub as unknown as Parameters<typeof champsBoutiqueDepuisAbonnement>[0],
    { prixAnnuel: PRIX_BOUTIQUE_ANNUEL },
  )
  const clientId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id

  const { data: ligne } = await admin
    .from('boutique_abonnements')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('lien_id', lienId)
    .maybeSingle()

  const clientConnu = (ligne?.stripe_customer_id as string | null | undefined) ?? null
  if (clientConnu && clientId && clientConnu !== clientId) {
    console.error('[stripe-webhook] boutique : client différent de celui du lien', lienId, sub.id)
    return
  }
  if (!boutiquePrendLAbonnement(sub as unknown as Parameters<typeof boutiquePrendLAbonnement>[0], ligne?.stripe_subscription_id as string | null | undefined)) {
    console.log('[stripe-webhook] boutique : écarté', sub.id, sub.status)
    return
  }
  if (champs.statut === 'aucun') {
    console.log('[stripe-webhook] boutique : statut inconnu, rien d’écrit', sub.id, sub.status)
    return
  }

  const ecriture: Record<string, unknown> = { lien_id: lienId, ...champs }
  if (!champs.abonnement_fin) delete ecriture.abonnement_fin
  if (clientId) ecriture.stripe_customer_id = clientId

  const { error } = await admin.from('boutique_abonnements').upsert(ecriture, { onConflict: 'lien_id' })
  if (error) console.error('[stripe-webhook] boutique : écriture', lienId, error)
  else console.log('[stripe-webhook] boutique', sub.id, champs.statut, champs.abonnement_frequence, champs.abonnement_annule ? 'résiliation programmée' : '')
}

/** Écrit l'état de l'abonnement sur le compte, retrouvé par son client Stripe. */
async function majDepuisAbonnement(stripe: Stripe, abonnementId: string, userIdConnu?: string | null) {
  const sub = await stripe.subscriptions.retrieve(abonnementId, { expand: ['discount'] })

  // Le même webhook sert les artisans ET les boutiques : le marquage posé à la création de la session
  // (et recopié par Stripe sur l'abonnement) dit à qui appartient celui-ci. Un abonnement de boutique ne
  // touche JAMAIS `assistant_profil` ; un marquage illisible n'écrit nulle part au lieu de glisser vers l'artisan.
  const cible = cibleDuWebhook(sub.metadata)
  if (cible.cible === 'boutique') return majBoutiqueDepuisAbonnement(sub, cible.lienId)
  if (cible.cible === 'inconnu') {
    console.error('[stripe-webhook] marquage boutique illisible, rien d’écrit', sub.id)
    return
  }

  const champs = champsDepuisAbonnement(
    sub as unknown as Parameters<typeof champsDepuisAbonnement>[0],
    { prixAnnuel: [PRIX_ANNUEL, PRIX_BOUTIQUE_ANNUEL] },
  )

  // `essai_fin` ne s'écrit que quand Stripe dit qu'il y a un essai : un abonnement payé n'en a plus,
  // et écraser la date par du vide effacerait la trace du passage par l'essai.
  const ecriture: Record<string, unknown> = { ...champs }
  if (!champs.essai_fin) delete ecriture.essai_fin

  // Un paiement revenu à bien rouvre la porte et remet les relances à zéro. C'est ce qui rend la
  // fermeture réversible : la personne met sa carte à jour, Stripe encaisse, tout repart sans que
  // personne n'ait à intervenir.
  if (champs.abonnement_statut === 'actif') {
    ecriture.acces_ferme_le = null
    ecriture.impaye_relances = 0
  }

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
    // `ecriture` et non `champs` : c'est la version corrigée (essai_fin préservé quand il n'y a plus
    // d'essai, porte rouverte et relances remises à zéro après un paiement revenu). Écrire `champs`
    // ici annulait les deux règles juste au-dessus — et un `essai_fin: null` écrasait la date de
    // l'essai à chaque événement Stripe.
    .update({ ...ecriture, stripe_customer_id: clientId ?? undefined })
    .eq('user_id', userId)
  if (error) console.error('[stripe-webhook] écriture du compte', error)
  else
    console.log(
      '[stripe-webhook]',
      sub.id,
      champs.abonnement_statut,
      champs.abonnement_prix_centimes,
      champs.abonnement_annule ? 'résiliation programmée' : '',
    )
}

/**
 * Crédite les jetons d'un achat de pack, une seule fois.
 *
 * Idempotent par construction : `crediter_pack` prend l'identifiant de session Stripe comme clef
 * unique et ne fait rien s'il est déjà là. Un événement rejoué — Stripe en renvoie jusqu'à ce qu'on
 * réponde 200 — ne crédite donc pas deux fois, et le code n'a pas à relire avant d'écrire.
 *
 * Un événement qui ne nous concerne pas ne déclenche RIEN : `creditDepuisSession` refuse une
 * session d'abonnement, un pack inconnu, un compte non identifié et un paiement non encaissé.
 * C'est le cas ordinaire, pas une anomalie — la même URL de webhook sert les deux achats.
 */
async function crediterPack(session: Stripe.Checkout.Session): Promise<void> {
  const credit = creditDepuisSession(session as unknown as Parameters<typeof creditDepuisSession>[0])
  if (!credit) {
    console.log('[stripe-webhook] paiement ignoré', session.id, session.mode, session.payment_status)
    return
  }
  const { data, error } = await admin.rpc('crediter_pack', {
    p_user: credit.userId,
    p_jetons: credit.jetons,
    p_source: credit.source,
    p_session: clefCredit(credit),
  })
  if (error) {
    // Journalisé : c'est la seule trace d'un crédit qui n'a pas eu lieu.
    console.error('[stripe-webhook] crédit impossible', credit.sessionId, error)
    return
  }
  console.log(
    '[stripe-webhook] crédit',
    credit.pack,
    credit.jetons,
    data === false ? 'déjà crédité' : 'accordé',
  )
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
      case 'checkout.session.completed':
      // Une méthode de paiement asynchrone (virement, Bancontact) confirme plus tard : c'est le
      // second événement qui porte le paiement encaissé, et c'est lui qui crédite.
      case 'checkout.session.async_payment_succeeded': {
        const session = evenement.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const abonnementId =
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          await majDepuisAbonnement(stripe, abonnementId, session.client_reference_id)
        }
        // Les deux achats passent par ici ; seul un achat de pack crédite des jetons, et
        // `crediterPack` écarte tout le reste (voir son commentaire).
        await crediterPack(session)
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
