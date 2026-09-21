// Abonnement Braaise : crée une session de paiement Stripe pour le compte connecté.
//
// Le Checkout est hébergé par Stripe : la carte ne traverse jamais notre code, et l'application n'a
// donc pas besoin de clé publique. Ce qui se décide ici, et seulement ici :
//   · quel prix — mensuel ou annuel, selon ce que la personne a choisi ;
//   · si le tarif fondateur s'applique — abonnement mensuel d'un compte `fondateur` uniquement ;
//   · la TVA — `automatic_tax` demandée à Stripe, et l'adresse saisie enregistrée sur le client
//     pour que les renouvellements soient taxés eux aussi (décision de JSB du 21/09).
//
// Un client Stripe est créé au premier paiement puis réutilisé : c'est lui qui permet au webhook de
// retrouver le compte.
//
// Secrets attendus : STRIPE_SECRET_KEY, STRIPE_PRIX_MENSUEL, STRIPE_PRIX_ANNUEL, STRIPE_COUPON_FONDATEUR.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { frequenceValide, parametresSession, type IdentifiantsStripe } from '../_shared/stripe.ts'

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
  if (!cle || !ids) {
    console.error('[stripe-checkout] secrets manquants')
    return json({ erreur: 'Le paiement n’est pas disponible pour le moment.' }, 503)
  }

  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: erreurAuth } = await admin.auth.getUser(jeton)
  if (erreurAuth || !auth?.user) return json({ erreur: 'non authentifié' }, 401)
  const utilisateur = auth.user

  const corps = (await req.json().catch(() => ({}))) as { frequence?: unknown }
  const frequence = frequenceValide(corps?.frequence)

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

  try {
    // Les paramètres sont assemblés dans `_shared/stripe.ts` (donc testés sans réseau) ; ici, il ne
    // reste que l'appel.
    const session = await stripe.checkout.sessions.create(
      parametresSession({
        frequence,
        ids,
        client,
        utilisateurId: utilisateur.id,
        url,
        plan: profil?.plan,
      }),
    )
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
