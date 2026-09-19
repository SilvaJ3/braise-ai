// Portail de gestion de l'abonnement.
//
// L'artisan doit pouvoir changer sa carte, télécharger ses factures et résilier **sans passer par
// nous**. Stripe fournit cette page : on lui ouvre une session et on lui donne le lien. Rien de ce
// qu'il y fait ne transite par notre code.
//
// Sans clé ni client Stripe, la fonction répond « pas disponible » plutôt que d'inventer une page.
// Secret attendu : STRIPE_SECRET_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'

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
  if (!cle) {
    console.error('[stripe-portal] STRIPE_SECRET_KEY manquante')
    return json({ erreur: 'indisponible' }, 503)
  }

  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: erreurAuth } = await admin.auth.getUser(jeton)
  if (erreurAuth || !auth?.user) return json({ erreur: 'non authentifié' }, 401)

  const { data: profil } = await admin
    .from('assistant_profil')
    .select('stripe_customer_id')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  const client = (profil?.stripe_customer_id as string | null) ?? null
  if (!client) {
    // Aucun paiement n'a encore eu lieu : il n'y a rien à gérer, et ce n'est pas une erreur.
    return json({ url: null, raison: 'aucun abonnement' })
  }

  const stripe = new Stripe(cle)
  const url = await adresseApp()

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: client,
      return_url: `${url}/compte/mon-compte`,
      locale: 'fr',
    })
    return json({ url: session.url })
  } catch (e) {
    console.error('[stripe-portal] ouverture du portail', e)
    return json({ erreur: 'Le portail n’a pas pu être ouvert.' }, 502)
  }
})
