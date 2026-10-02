// Les rappels de l'abonnement : ce qui part, à qui, et quand.
//
// Trois envois, et ils n'ont pas la même raison d'être :
//   · deux jours avant la fin de l'essai, puis la veille — la personne apprend ce qui va être
//     prélevé, combien, quand, et comment l'arrêter. C'est ce qui distingue un essai d'un piège ;
//   · après un prélèvement refusé, trois relances espacées de trois jours ; une semaine après la
//     dernière restée sans réponse, l'accès se met en pause (décision de JSB, 02/10/2026) ;
//   · quinze jours avant la reconduction de l'abonnement à l'année, l'avis que la loi belge impose.
//
// Ce que cette fonction ne fait pas : décider. Les règles vivent dans `_shared/essai.ts`, les
// actions du jour dans `_shared/rappels-abonnement.ts`, les textes dans `_shared/mail-abonnement.ts`.
// Ici on lit la base, on envoie, on écrit la trace — et rien de plus.
//
// Elle est appelée par pg_cron (07:15 UTC, tous les jours) avec l'en-tête `x-cron-secret`, vérifié
// en base (`verify_cron_secret`) comme les rappels boutique et la fonction `push`. Le cron peut
// exister et répondre « je n'envoie rien » : `rappels_abonnement_actifs` est le coupe-circuit.
//
// Modes :
//   quotidien → le cron : ce que la base dit de devoir envoyer, et c'est tout
//   apercu    → ce qui partirait, sans rien envoyer ni écrire (lecture seule)
//   essai     → les mêmes mails, mais TOUS vers une seule adresse ({ "email": "…" }) : c'est ainsi
//               qu'on vérifie un envoi sans écrire à un vrai client. Aucune trace en base.
//
// Secrets attendus : RESEND_API_KEY, MAIL_DOMAIN (les mêmes que les autres envois).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { envoyerMail } from '../_shared/mailer.ts'
import {
  mailAvisRenouvellement,
  mailEssaiBientot,
  mailImpaye,
  type MailAbonnement,
  type Situation,
} from '../_shared/mail-abonnement.ts'
import {
  actionsDuJour,
  majDeLaction,
  type Action,
  type CompteAbonnement,
} from '../_shared/rappels-abonnement.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()
const MAIL_DOMAIN = Deno.env.get('MAIL_DOMAIN')?.trim() || 'braaise.io'

/** Le nom affiché en expéditeur : c'est le produit qui écrit, pas une personne. */
const EXPEDITEUR = 'Braaise'

/**
 * Le prix mensuel public, en centimes : il ne sert QUE de repli quand le webhook n'a pas encore
 * écrit le montant du compte. Annoncer un montant faux serait pire que tout, mais un rappel sans
 * montant ne prévient de rien — et c'est un essai qui vient de s'ouvrir, donc le seul cas.
 */
const MONTANT_MENSUEL_REPLI = 3900

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

async function cronAllowed(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret')
  if (!secret) return false
  const { data } = await admin.rpc('verify_cron_secret', { candidate: secret })
  return data === true
}

/** Les réglages du produit : ce qui se change en une ligne de SQL, sans redéploiement. */
async function reglages(cles: string[]): Promise<Record<string, string>> {
  const { data } = await admin.from('reglages_produit').select('cle, valeur').in('cle', cles)
  const out: Record<string, string> = {}
  for (const r of data ?? []) out[r.cle as string] = String(r.valeur ?? '')
  return out
}

/** La situation d'envoi d'un compte : le montant réel écrit par le webhook, jamais un montant deviné. */
function situation(c: CompteAbonnement, urlApp: string): Situation {
  return {
    expediteur: EXPEDITEUR,
    urlApp,
    montantCentimes: c.abonnement_prix_centimes ?? MONTANT_MENSUEL_REPLI,
    frequence: c.abonnement_frequence === 'an' ? 'an' : 'mois',
  }
}

/**
 * Le mail d'une action — `null` pour une fermeture, qui ne s'annonce pas : elle a été annoncée par
 * la dernière relance (« une semaine après ce mail »). Un second mail le jour de la fermeture
 * n'apprendrait rien et ferait doublon.
 */
function mailDeLaction(a: Action, urlApp: string): MailAbonnement | null {
  const s = situation(a.compte, urlApp)
  switch (a.type) {
    case 'essai':
      return mailEssaiBientot({ ...s, jours: a.jours, finLe: a.finLe })
    case 'impaye':
      return mailImpaye({ ...s, relance: a.relance })
    case 'renouvellement':
      return mailAvisRenouvellement({ ...s, finLe: a.finLe })
    default:
      return null
  }
}

async function envoyer(destinataire: string, mail: MailAbonnement, prefixe = ''): Promise<void> {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY absente')
  await envoyerMail(
    { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
    {
      fromName: EXPEDITEUR,
      to: [destinataire],
      subject: `${prefixe}${mail.subject}`,
      text: mail.text,
      html: mail.html,
    },
  )
}

async function marquer(userId: string, maj: Record<string, string | number>): Promise<void> {
  const { error } = await admin.from('assistant_profil').update(maj).eq('user_id', userId)
  if (error) console.error('[abonnement-rappels] trace non écrite', userId, error)
}

/** Une action, en clair, pour l'aperçu : de quoi vérifier la décision sans envoyer. */
function decrire(a: Action): Record<string, unknown> {
  const base = { type: a.type, user_id: a.compte.user_id, email: a.compte.email ?? null }
  switch (a.type) {
    case 'essai':
      return { ...base, jours: a.jours, fin: a.finLe }
    case 'impaye':
      return { ...base, relance: a.relance }
    case 'renouvellement':
      return { ...base, fin: a.finLe }
    default:
      return base
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'méthode non autorisée' }, 405)
  if (!(await cronAllowed(req))) return json({ error: 'non autorisé' }, 401)

  const corps = (await req.json().catch(() => ({}))) as { mode?: unknown; email?: unknown }
  const mode = typeof corps?.mode === 'string' ? corps.mode : 'quotidien'
  const maintenant = new Date()

  const { app_url: urlApp } = await reglages(['app_url'])
  const { data, error } = await admin.rpc('abonnements_a_rappeler')
  if (error) return json({ error: error.message }, 500)

  const compte = (data ?? []) as CompteAbonnement[]
  const actions = actionsDuJour(compte, maintenant)

  // L'aperçu ne réserve rien, n'écrit rien, n'envoie rien : c'est ce qui se lit avant d'armer.
  if (mode === 'apercu') {
    const { rappels_abonnement_actifs: arme } = await reglages(['rappels_abonnement_actifs'])
    return json({
      mode,
      arme: arme === 'oui',
      comptes: compte.length,
      actions: actions.map(decrire),
    })
  }

  // Le mode d'essai envoie à qui on le dit, et ne laisse AUCUNE trace : une répétition ne doit pas
  // marquer un compte comme prévenu et faire taire le vrai rappel.
  if (mode === 'essai') {
    const email = String(corps?.email ?? '').trim()
    if (!email) return json({ error: 'email requis en mode essai' }, 400)
    const envoyes: { type: string; sujet: string }[] = []
    const echecs: { type: string; erreur: string }[] = []
    for (const a of actions) {
      const mail = mailDeLaction(a, urlApp)
      if (!mail) continue
      try {
        await envoyer(email, mail, '[essai] ')
        envoyes.push({ type: a.type, sujet: mail.subject })
      } catch (e) {
        echecs.push({ type: a.type, erreur: String((e as Error).message ?? e) })
      }
    }
    return json({ mode, email, envoyes, echecs, aucune_trace: true })
  }

  const { rappels_abonnement_actifs: arme } = await reglages(['rappels_abonnement_actifs'])
  if (arme !== 'oui') {
    return json({ mode, arme: false, actions: actions.length, envoye: 0 })
  }

  const envoyes: { type: string; user_id: string }[] = []
  const fermes: string[] = []
  const echecs: { type: string; user_id: string; erreur: string }[] = []

  for (const a of actions) {
    // La fermeture ne s'annonce pas : elle a été annoncée par la dernière relance.
    if (a.type === 'fermeture') {
      await marquer(a.compte.user_id, { acces_ferme_le: maintenant.toISOString() })
      fermes.push(a.compte.user_id)
      continue
    }
    if (!a.compte.email) continue
    const mail = mailDeLaction(a, urlApp)
    if (!mail) continue
    try {
      await envoyer(a.compte.email, mail)
      const maj = majDeLaction(a, maintenant)
      // La trace s'écrit APRÈS l'envoi : une action annoncée n'est pas une action faite, et le cron
      // de demain doit reprendre ce qui n'est pas parti.
      if (maj) await marquer(a.compte.user_id, maj)
      envoyes.push({ type: a.type, user_id: a.compte.user_id })
    } catch (e) {
      echecs.push({
        type: a.type,
        user_id: a.compte.user_id,
        erreur: String((e as Error).message ?? e),
      })
    }
  }

  return json({ mode, arme: true, actions: actions.length, envoyes, fermes, echecs })
})
