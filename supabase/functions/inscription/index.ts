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
  conditionsRefusees,
  emailInvalide,
  MESSAGES,
  motDePasseInvalide,
  normaliserCode,
  normaliserEmail,
} from '../_shared/inscription.ts'
import { construireMailAccueil } from '../_shared/mail-accueil.ts'
import { envoyerMail } from '../_shared/mailer.ts'

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

// Secrets de l'envoi, les mêmes que `depot` et `abonnement-rappels` : Resend + le domaine vérifié.
const MAIL_DOMAIN = Deno.env.get('MAIL_DOMAIN')?.trim() || 'braaise.io'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
// Surcharge possible par secret ; à défaut, l'adresse de l'app vit en base (`reglages_produit.app_url`),
// comme pour `demande-acces`. Elle n'est JAMAIS écrite en dur : la valeur de production est
// `https://artisan.braaise.io`, et elle change sans redéploiement depuis la base.
const APP_URL_ENV = Deno.env.get('APP_URL')?.trim()

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

/**
 * L'adresse de l'application pour le lien du mail d'accueil : le secret s'il est posé, sinon la
 * base. Rendue sans barre oblique finale ; une chaîne vide veut dire « introuvable » — l'appelant
 * décide alors de ne rien envoyer plutôt que d'envoyer un lien qui ne mène nulle part.
 */
async function adresseApp(): Promise<string> {
  if (APP_URL_ENV) return APP_URL_ENV.replace(/\/+$/, '')
  const { data, error } = await admin
    .from('reglages_produit')
    .select('valeur')
    .eq('cle', 'app_url')
    .maybeSingle()
  if (error) {
    console.error('[inscription] adresse de l’app', error)
    return ''
  }
  return String((data as { valeur?: string } | null)?.valeur ?? '').trim().replace(/\/+$/, '')
}

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
  | 'sans_conditions'
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
      // Une case décochée n'est pas une tentative de deviner un code : elle ne compte pas dans le
      // plafond non plus, sinon un formulaire mal câblé fermerait la porte à quelqu'un qui essaie
      // vraiment.
      .neq('resultat', 'email_invalide')
      .neq('resultat', 'sans_conditions')
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

  // L'acceptation des conditions, vérifiée ici et pas seulement à l'écran : la case existe dans le
  // formulaire, mais un appel direct à cette fonction doit être refusé de la même façon. C'est
  // cette ligne qui donne sa valeur à la date écrite sur le compte juste en dessous.
  const refusConditions = conditionsRefusees(body.conditions)
  if (refusConditions) {
    await journaliser(email, ip, 'sans_conditions')
    return json({ error: refusConditions }, 400)
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

  // L'acceptation est datée ici, avec la clé de service : un compte accepte au moment où il se
  // crée, et cette date ne peut venir que de ce chemin (le client ne peut pas l'écrire lui-même).
  const { error: errProfil } = await admin
    .from('assistant_profil')
    .insert({ user_id: userId, conditions_acceptees_le: new Date().toISOString() })
  if (errProfil) console.error('[inscription] ligne de profil', errProfil)

  // 4. Le mail d'accueil — le lien de l'app et le modèle d'import en pièce jointe.
  //    Il part APRÈS coup, et son échec ne peut JAMAIS faire échouer l'inscription : à cet instant
  //    le compte existe et le code est consommé. Un envoi raté se renvoie ; une inscription perdue
  //    ne se rattrape pas. D'où l'enveloppe, la journalisation, et la réponse `{ ok: true }` qui ne
  //    dépend de rien de ce qui suit.
  try {
    const urlApp = await adresseApp()
    if (!urlApp) {
      console.error('[inscription] mail d’accueil non envoyé : adresse de l’app introuvable')
    } else {
      const mail = construireMailAccueil({ urlApp })
      await envoyerMail(
        { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN, timeoutMs: 15_000 },
        {
          fromName: 'Braaise',
          // Les réponses doivent revenir au bon endroit : c'est `contact@braaise.io` (voir le
          // brouillon du mail et la doctrine d'envoi).
          replyTo: 'contact@braaise.io',
          to: [email],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          attachments: mail.attachments,
        },
      )
    }
  } catch (e) {
    console.error('[inscription] mail d’accueil', e)
  }

  await journaliser(email, ip, 'ok')
  return json({ ok: true, email, plan: invitation.plan })
})
