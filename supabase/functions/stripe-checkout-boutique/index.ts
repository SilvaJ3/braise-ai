// Abonnement Braaise BOUTIQUE : crée une session de paiement Stripe pour le compte de boutique connecté.
//
// Fonction à part de `stripe-checkout` (celle des artisans) : on ne touche pas au code de paiement qui
// sert déjà. Ce qui diffère :
//   · le compte est retrouvé par `boutique_liens.compte_id` — jamais par un identifiant venu de l'appelant ;
//   · l'état vit dans `boutique_abonnements` (0082), pas dans `assistant_profil` ;
//   · deux formules, au mois ou à l'année (engagement annuel) ; un seul abonnement à la fois ;
//   · pas d'essai Stripe par défaut : les mois offerts sont un ACCÈS OFFERT en base. Si la boutique
//     s'abonne PENDANT cet accès, l'abonnement démarre en essai jusqu'au lendemain de sa fin, pour
//     qu'elle ne perde aucun jour offert : la carte n'est prélevée qu'à ce moment-là, par le geste
//     qu'elle vient de faire (`finEssaiPourAccesOffert`) ;
//   · aucune renonciation au droit de rétractation : celle de l'artisan vise un consommateur, une
//     boutique est professionnelle. À trancher avec les CGU avant d'en reprendre une.
//
// La session ET l'abonnement portent `braaise_cible=boutique` et `lien_id` : c'est ce qui permet au
// webhook (une seule adresse pour tout le monde) de ne jamais écrire sur un compte d'artisan.
//
// Le Checkout est hébergé par Stripe : la carte ne traverse jamais notre code.
// Les réglages de la page (devise verrouillée, TVA, enregistrement de la carte) sont une COPIE de ceux de
// `stripe-checkout`, validés à l'API le 02/10/2026 ; à factoriser quand les deux seront stables.
//
// NON DÉPLOYÉE. Secrets attendus : STRIPE_SECRET_KEY, STRIPE_PRIX_BOUTIQUE_MENSUEL et, pour l'engagement
// annuel, STRIPE_PRIX_BOUTIQUE_ANNUEL (absent : l'annuel est refusé, le mensuel continue).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import {
  boutiqueDejaAbonnee,
  finEssaiPourAccesOffert,
  frequenceBoutiqueValide,
  metadonneesBoutique,
  prixBoutiquePour,
  type IdentifiantsBoutique,
} from '../_shared/stripe-boutique.ts'

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

/** Les prix vivent en secrets. Le mensuel est requis ; l'annuel est facultatif (absent = non proposé). */
function identifiants(): IdentifiantsBoutique | null {
  const prixMensuel = Deno.env.get('STRIPE_PRIX_BOUTIQUE_MENSUEL')?.trim()
  if (!prixMensuel) return null
  return { prixMensuel, prixAnnuel: Deno.env.get('STRIPE_PRIX_BOUTIQUE_ANNUEL')?.trim() || null }
}

/** L'adresse de l'application, réglée en base (`app_url`) — jamais en dur dans le code. */
async function adresseApp(): Promise<string> {
  const { data } = await admin.from('reglages_produit').select('valeur').eq('cle', 'app_url').maybeSingle()
  const lue = typeof data?.valeur === 'string' ? data.valeur.trim() : ''
  return (lue || 'https://braise-ai.vercel.app').replace(/\/+$/, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erreur: 'méthode non autorisée' }, 405)

  const cle = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
  const ids = identifiants()
  if (!cle || !ids) {
    console.error('[stripe-checkout-boutique] secrets manquants')
    return json({ erreur: 'Le paiement n’est pas disponible pour le moment.' }, 503)
  }

  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: erreurAuth } = await admin.auth.getUser(jeton)
  if (erreurAuth || !auth?.user) return json({ erreur: 'non authentifié' }, 401)
  const utilisateur = auth.user

  const corps = (await req.json().catch(() => ({}))) as { frequence?: unknown }
  const frequence = frequenceBoutiqueValide(corps?.frequence)
  const prix = prixBoutiquePour(frequence, ids)
  if (!prix) {
    console.error('[stripe-checkout-boutique] prix non configuré pour', frequence)
    return json({ erreur: 'Cette formule n’est pas disponible pour le moment.' }, 503)
  }

  // La boutique est retrouvée à partir du COMPTE connecté : aucun identifiant de lien n'est accepté du client.
  const { data: lien, error: erreurLien } = await admin
    .from('boutique_liens')
    .select('id')
    .eq('compte_id', utilisateur.id)
    .maybeSingle()
  if (erreurLien) {
    console.error('[stripe-checkout-boutique] lecture du lien', erreurLien)
    return json({ erreur: 'Le paiement n’est pas disponible pour le moment.' }, 503)
  }
  if (!lien) return json({ erreur: 'Ce compte n’est pas un compte de boutique.' }, 403)
  const lienId = lien.id as string

  const { data: abo } = await admin
    .from('boutique_abonnements')
    .select('statut, acces_offert_jusqu_au, stripe_customer_id')
    .eq('lien_id', lienId)
    .maybeSingle()

  // Un seul abonnement à la fois : sans cette garde, un clic de trop faisait prélever deux fois.
  if (boutiqueDejaAbonnee(abo?.statut)) {
    return json({ erreur: 'Ton abonnement est déjà en cours : gère-le depuis « Mon abonnement ».' }, 409)
  }

  const stripe = new Stripe(cle)
  const url = await adresseApp()
  const meta = metadonneesBoutique(lienId)

  // Un client Stripe par boutique, créé à la première demande puis réutilisé.
  let client = (abo?.stripe_customer_id as string | null) ?? null
  if (!client) {
    try {
      const cree = await stripe.customers.create({ email: utilisateur.email ?? undefined, metadata: meta })
      client = cree.id
    } catch (e) {
      console.error('[stripe-checkout-boutique] création du client', e)
      return json({ erreur: 'Le paiement n’a pas pu être ouvert.' }, 502)
    }
    // Écrit SEULEMENT le client : une ligne existante (accès offert) garde ses autres colonnes.
    const { error } = await admin
      .from('boutique_abonnements')
      .upsert({ lien_id: lienId, stripe_customer_id: client }, { onConflict: 'lien_id' })
    if (error) {
      // Sans ce lien, le webhook ne saurait pas à qui rattacher l'abonnement : on s'arrête là.
      console.error('[stripe-checkout-boutique] rattachement du client', error)
      return json({ erreur: 'Le paiement n’est pas disponible pour le moment.' }, 503)
    }
  }

  // Les mois offerts ne se perdent pas : s'abonner pendant l'accès offert reporte le premier prélèvement.
  const finEssai = abo?.statut === 'offert' ? finEssaiPourAccesOffert(abo.acces_offert_jusqu_au as string | null) : null

  // Réglages communs à la page de paiement : copie de `stripe-checkout` (voir l'en-tête). `ui_mode` et les
  // deux identifiants passent hors typage : l'API les accepte, les types de `stripe@17` ne les connaissent pas.
  const reglagesStudio = {
    ui_mode: 'hosted_page',
    billing_address_collection: 'required',
    phone_number_collection: { enabled: false },
    automatic_tax: { enabled: true },
    submit_type: 'auto',
    saved_payment_method_options: { payment_method_save: 'enabled' },
    integration_identifier: 'hosted_web_0001',
    origin_context: 'web',
  } as unknown as Stripe.Checkout.SessionCreateParams

  try {
    const session = await stripe.checkout.sessions.create({
      ...reglagesStudio,
      mode: 'subscription',
      customer: client,
      line_items: [{ price: prix, quantity: 1 }],
      // La TVA se lit HTVA et s'ajoute ; le numéro de TVA d'une boutique professionnelle est recueilli
      // (autoliquidation hors Belgique). `customer_update` l'enregistre sur le client Stripe.
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      // La carte est exigée MÊME pendant l'accès offert reporté : c'est elle qui prélèvera, une fois, à la fin.
      payment_method_collection: 'always',
      // Le prix est en euros et doit s'afficher en euros (constat du 20/09/2026 : « CA$48,45 »).
      adaptive_pricing: { enabled: false },
      // Un code peut être saisi : c'est par là que passera un geste commercial (ex. le tarif de Lara).
      allow_promotion_codes: true,
      client_reference_id: lienId,
      metadata: meta,
      subscription_data: {
        metadata: meta,
        ...(finEssai ? { trial_end: finEssai } : {}),
      },
      success_url: `${url}/espace-boutique/abonnement?paiement=${finEssai ? 'offert' : 'ok'}`,
      cancel_url: `${url}/espace-boutique/abonnement?paiement=annule`,
    })
    if (!session.url) {
      console.error('[stripe-checkout-boutique] session sans adresse', session.id)
      return json({ erreur: 'Le paiement n’a pas pu être ouvert.' }, 502)
    }
    return json({ url: session.url })
  } catch (e) {
    console.error('[stripe-checkout-boutique] création de la session', e)
    return json({ erreur: 'Le paiement n’a pas pu être ouvert.' }, 502)
  }
})
