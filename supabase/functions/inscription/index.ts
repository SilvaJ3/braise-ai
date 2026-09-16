// Inscription sur invitation — le seul chemin vers un compte.
//
// L'inscription publique est désactivée sur le projet (mesuré : `signup_disabled`) : ce point
// d'entrée crée les comptes côté serveur avec la clé service_role, et n'accepte que les
// porteurs d'un code de la table `invitations` (lisible par personne d'autre que service_role).
//
// L'email n'est pas confirmé par un clic : GoTrue n'envoie aucun mail sur ce projet (aucun SMTP
// configuré, `confirmation_sent_at` reste nul). Le code d'invitation fait donc office de
// vérification — il n'est donné qu'à des personnes connues. À reprendre le jour où un SMTP est
// branché (voir ROADMAP, « Mails de service »).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  emailInvalide,
  MESSAGES,
  motDePasseInvalide,
  normaliserCode,
  normaliserEmail,
} from '../_shared/inscription.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Un formulaire d'inscription tient en quelques centaines d'octets.
const MAX_BODY_BYTES = 4 * 1024
// Chaque tentative aboutie crée un compte (donc un coût futur) : on borne le martèlement.
// Large pour un humain qui se trompe de code, étroit pour un script.
const MAX_TENTATIVES_PAR_HEURE = 12

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

type Resultat =
  | 'ok'
  | 'code_inconnu'
  | 'email_pris'
  | 'email_invalide'
  | 'mot_de_passe_faible'
  | 'trop_de_tentatives'
  | 'erreur'

/** Journalise sans jamais faire échouer l'inscription sur une erreur de journal. */
async function journaliser(email: string, ip: string | null, resultat: Resultat): Promise<void> {
  const { error } = await admin
    .from('inscription_tentatives')
    .insert({ email: email.slice(0, 254) || 'inconnu', ip: ip?.slice(0, 64) ?? null, resultat })
  if (error) console.error('[inscription] journal', error)
}

async function tropDeTentatives(email: string, ip: string | null): Promise<boolean> {
  const depuis = new Date(Date.now() - 3_600_000).toISOString()
  const compter = async (colonne: 'email' | 'ip', valeur: string) => {
    const { count, error } = await admin
      .from('inscription_tentatives')
      .select('id', { count: 'exact', head: true })
      .eq(colonne, valeur)
      .gt('created_at', depuis)
      // Les refus qui n'atteignent jamais le service (email mal formé, champs vides) ne comptent
      // pas : ils relèvent de la faute de frappe, et une faute de frappe ne doit pas fermer la
      // porte à quelqu'un qui essaie vraiment. Ce qu'on borne, c'est la recherche de code et la
      // création de comptes.
      .neq('resultat', 'email_invalide')
    if (error) {
      // Un compteur illisible ne doit pas fermer la porte à une vraie inscription.
      console.error('[inscription] compteur', error)
      return 0
    }
    return count ?? 0
  }
  const parEmail = await compter('email', email)
  if (parEmail >= MAX_TENTATIVES_PAR_HEURE) return true
  if (!ip) return false
  return (await compter('ip', ip)) >= MAX_TENTATIVES_PAR_HEURE
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)

  const taille = Number(req.headers.get('content-length') ?? 0)
  if (taille > MAX_BODY_BYTES) return json({ error: 'requête trop volumineuse' }, 413)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const body = await req.json().catch(() => ({} as Record<string, unknown>))

  const code = normaliserCode(body.code)
  const email = normaliserEmail(body.email)
  // Pas de trim sur le mot de passe : les espaces en font partie.
  const motDePasse = typeof body.password === 'string' ? body.password : ''

  if (!code || !email || !motDePasse) {
    await journaliser(email, ip, 'email_invalide')
    return json({ error: MESSAGES.champs }, 400)
  }

  const erreurEmail = emailInvalide(email)
  if (erreurEmail) {
    await journaliser(email, ip, 'email_invalide')
    return json({ error: erreurEmail }, 400)
  }

  const erreurMotDePasse = motDePasseInvalide(motDePasse)
  if (erreurMotDePasse) {
    await journaliser(email, ip, 'mot_de_passe_faible')
    return json({ error: erreurMotDePasse }, 400)
  }

  if (await tropDeTentatives(email, ip)) {
    await journaliser(email, ip, 'trop_de_tentatives')
    return json({ error: MESSAGES.trop_de_tentatives }, 429)
  }

  // 1. Réserver le code : c'est ce qui empêche deux inscriptions simultanées de passer avec le
  //    même. La réservation expire seule au bout de 10 minutes (voir migration 0037).
  const { data: reservation, error: errReservation } = await admin.rpc('invitation_reserver', {
    p_code: code,
    p_email: email,
  })
  if (errReservation) {
    console.error('[inscription] réservation', errReservation)
    await journaliser(email, ip, 'erreur')
    return json({ error: MESSAGES.erreur }, 500)
  }
  const invitation = (reservation as { code: string; plan: string }[] | null)?.[0]
  if (!invitation) {
    await journaliser(email, ip, 'code_inconnu')
    return json({ error: MESSAGES.code }, 400)
  }

  // 2. Créer le compte. `email_confirm: true` : il n'y a pas de mail à cliquer (voir en-tête).
  const { data: creation, error: errCreation } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { invitation: invitation.code, plan: invitation.plan },
  })

  if (errCreation || !creation?.user) {
    // Le code n'a pas été consommé : il doit resservir tout de suite.
    await admin.rpc('invitation_liberer', { p_code: code })
    const message = errCreation?.message ?? ''
    const dejaPris = /already|exists|registered/i.test(message)
    const motDePasseRefuse = /weak_password|password should contain/i.test(message)
    console.error('[inscription] création', errCreation)
    await journaliser(email, ip, dejaPris ? 'email_pris' : motDePasseRefuse ? 'mot_de_passe_faible' : 'erreur')
    if (dejaPris) return json({ error: MESSAGES.email_pris }, 409)
    if (motDePasseRefuse) return json({ error: MESSAGES.mot_de_passe_faible }, 400)
    return json({ error: MESSAGES.erreur }, 500)
  }

  const userId = creation.user.id

  // 3. Consommer le code, puis préparer la ligne de profil. `onboarding_completed_at` reste nul :
  //    c'est la porte d'entrée du tunnel d'accueil (T3).
  const { error: errConfirmation } = await admin.rpc('invitation_confirmer', {
    p_code: code,
    p_user: userId,
  })
  if (errConfirmation) console.error('[inscription] confirmation du code', errConfirmation)

  const { error: errProfil } = await admin.from('assistant_profil').insert({ user_id: userId })
  if (errProfil) console.error('[inscription] ligne de profil', errProfil)

  await journaliser(email, ip, 'ok')
  return json({ ok: true, email, plan: invitation.plan })
})
