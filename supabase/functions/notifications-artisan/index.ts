// La boutique vient de faire quelque chose — confirmer un bon reçu, demander un réassort : l'artisan
// doit le savoir tout de suite. Cette fonction porte cet événement sur ses deux canaux, un push et
// un mail, et rien d'autre.
//
// Appelée de deux façons, avec le même code :
//   · tout de suite, par la base : `notifier_artisan` (migration 0068) pose la ligne puis appelle
//     pg_net, au moment même du clic de la boutique ;
//   · toutes les cinq minutes par pg_cron, pour rattraper un envoi resté en panne — le cron ne
//     refait que ce qui manque.
//
// La ligne en base (`notifications_artisan`) porte la preuve des deux canaux séparément : `push_le`
// et `mail_le` disent chacun ce qui est réglé, `erreur` garde la raison exacte. Un push impossible
// (aucun appareil abonné) et un push en panne ne se confondent pas : le premier est réglé, le second
// sera repris.
//
// Modes :
//   traiter  → ce qui est en attente part, vers l'artisan (défaut)
//   apercu   → ce qui attend, sans rien réserver ni envoyer
//   essai    → les mêmes messages, TOUS vers une adresse choisie, sans push et sans trace en base :
//              c'est ainsi qu'on vérifie un envoi sans écrire à un vrai compte
//
// Secrets attendus : RESEND_API_KEY, MAIL_DOMAIN (les mêmes que `depot`).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { envoyerMail } from '../_shared/mailer.ts'
import {
  mailBonConfirme,
  mailReassort,
  pushBonConfirme,
  pushReassort,
  type BonConfirme,
  type Ligne,
  type Message,
  type Push,
  type Reassort,
  type TypeNotifArtisan,
} from '../_shared/notif-artisan.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()
const MAIL_DOMAIN = Deno.env.get('MAIL_DOMAIN')?.trim() || 'braaise.io'

const APP_URL_DEFAUT = 'https://braise-ai.vercel.app'
const ADRESSE_REPONSE = 'contact@braaise.io'

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

async function reglages(cles: string[]): Promise<Record<string, string>> {
  const { data } = await admin.from('reglages_produit').select('cle, valeur').in('cle', cles)
  const out: Record<string, string> = {}
  for (const r of data ?? []) out[r.cle as string] = String(r.valeur ?? '')
  return out
}

type NotifRow = {
  id: string
  user_id: string
  type: TypeNotifArtisan
  ref: Record<string, unknown>
  tentative: number
  push_le: string | null
  mail_le: string | null
}

/** Le compte qui reçoit : son adresse de fiche d'abord, celle de la connexion sinon. */
async function destinataire(userId: string): Promise<string | null> {
  const { data } = await admin.from('profil_entreprise').select('email').eq('user_id', userId).maybeSingle()
  const fiche = String(data?.email ?? '').trim()
  if (fiche.includes('@')) return fiche
  const { data: u } = await admin.auth.admin.getUserById(userId)
  const brut = String(u?.user?.email ?? '').trim()
  return brut.includes('@') ? brut : null
}

/** Ce qu'il faut dire, selon l'événement. `null` = l'événement n'existe plus, ou n'a plus de sens. */
type Contenu = { push: Push; mail: Message } | { abandon: string }

async function contenuBonConfirme(ref: Record<string, unknown>, appUrl: string): Promise<Contenu> {
  const bonId = String(ref.bon_id ?? '')
  if (!bonId) return { abandon: 'bon absent de la notification' }

  const { data: d } = await admin
    .from('depots')
    .select('id, numero, date_depot, confirme_le, boutique_nom, boutique_id, archived_at')
    .eq('id', bonId)
    .maybeSingle()
  if (!d) return { abandon: 'bon introuvable' }
  if (!d.confirme_le) return { abandon: 'bon non confirmé : rien à annoncer' }
  if (d.archived_at) return { abandon: 'bon archivé' }

  const { data: lignes } = await admin
    .from('depot_lignes')
    .select('designation, quantite, position')
    .eq('depot_id', bonId)
    .order('position')

  let boutique = String(d.boutique_nom ?? '').trim()
  if (!boutique && d.boutique_id) {
    const { data: b } = await admin.from('boutiques').select('nom').eq('id', d.boutique_id).maybeSingle()
    boutique = String(b?.nom ?? '').trim()
  }

  const doc: BonConfirme = {
    boutique: boutique || 'Une boutique',
    numero: String(d.numero ?? '(sans numéro)'),
    date_depot: String(d.date_depot ?? ''),
    // `confirme_le` est un horodatage : la date seule suffit dans un texte.
    confirme_le: String(d.confirme_le).slice(0, 10),
    lignes: (lignes ?? []).map((l) => ({
      designation: String(l.designation ?? ''),
      quantite: Number(l.quantite ?? 0),
    })) as Ligne[],
  }

  return {
    push: pushBonConfirme(doc),
    mail: mailBonConfirme(doc, { lien: appUrl ? `${appUrl}/depots/${bonId}` : '' }),
  }
}

async function contenuReassort(ref: Record<string, unknown>, appUrl: string): Promise<Contenu> {
  const commandeId = String(ref.commande_id ?? '')
  if (!commandeId) return { abandon: 'commande absente de la notification' }

  const { data: c } = await admin
    .from('commandes')
    .select('id, type, statut, date_echeance, notes, boutique_id, archived_at')
    .eq('id', commandeId)
    .maybeSingle()
  if (!c) return { abandon: 'commande introuvable' }
  if (c.type !== 'boutique') return { abandon: 'commande qui n’est pas une demande de boutique' }
  if (c.archived_at) return { abandon: 'commande archivée' }

  const { data: lignes } = await admin
    .from('commande_lignes')
    .select('designation, quantite, position')
    .eq('commande_id', commandeId)
    .order('position')

  let boutique = ''
  if (c.boutique_id) {
    const { data: b } = await admin.from('boutiques').select('nom').eq('id', c.boutique_id).maybeSingle()
    boutique = String(b?.nom ?? '').trim()
  }

  const doc: Reassort = {
    boutique: boutique || 'Une boutique',
    echeance: String(c.date_echeance ?? ''),
    lignes: (lignes ?? []).map((l) => ({
      designation: String(l.designation ?? ''),
      quantite: Number(l.quantite ?? 0),
    })) as Ligne[],
    note: (c.notes as string | null) ?? null,
  }

  return {
    push: pushReassort(doc),
    mail: mailReassort(doc, { lien: appUrl ? `${appUrl}/commandes/${commandeId}` : '' }),
  }
}

/**
 * Le push passe par la fonction `push` (celle des rappels de planning) : la clé VAPID, l'envoi et
 * le ménage des abonnements expirés vivent là-bas, et une seule implémentation vaut mieux que deux.
 * `ok` dit si un appareil a accepté ; `bloque` dit qu'un nouvel essai a un sens.
 */
async function pousser(
  userId: string,
  push: Push,
  url: string,
): Promise<{ ok: boolean; bloque: boolean; detail: string }> {
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'notify', user_id: userId, title: push.title, body: push.body, url }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    return { ok: false, bloque: true, detail: `push injoignable (${String((e as Error).message ?? e).slice(0, 120)})` }
  }

  const data = (await res.json().catch(() => ({}))) as { sent?: number; error?: string }
  if (!res.ok) {
    return { ok: false, bloque: true, detail: `push refusé (${String(data.error ?? res.status).slice(0, 120)})` }
  }
  const sent = Number(data.sent ?? 0)
  if (sent > 0) return { ok: true, bloque: false, detail: `${sent} appareil(s)` }
  // Aucun appareil abonné : rien à réessayer. Le mail, lui, part quand même — c'est lui qui rend
  // « être sûr » vrai, et la trace doit dire pourquoi le push n'a rien donné.
  return { ok: false, bloque: false, detail: 'aucun appareil abonné au push' }
}

type Resultat = { id: string; type: string; push: string; mail: string; erreur: string | null }

async function traiterUne(
  row: NotifRow,
  opts: { appUrl: string; essai?: string },
): Promise<Resultat> {
  const ref = (row.ref ?? {}) as Record<string, unknown>
  const contenu =
    row.type === 'bon_confirme'
      ? await contenuBonConfirme(ref, opts.appUrl)
      : await contenuReassort(ref, opts.appUrl)

  if ('abandon' in contenu) {
    const erreur = contenu.abandon
    if (!opts.essai) {
      // Rien à annoncer, et rien qui changera : la ligne est réglée, avec sa raison.
      await admin.rpc('marquer_notification_artisan', {
        p_id: row.id,
        p_push: true,
        p_mail: true,
        p_erreur: erreur,
      })
    }
    return { id: row.id, type: row.type, push: 'abandonné', mail: 'abandonné', erreur }
  }

  const { push, mail } = contenu

  // --- Le mode essai : tout vers une adresse, rien en base ------------------------------------
  if (opts.essai) {
    if (!RESEND_API_KEY) return { id: row.id, type: row.type, push: 'essai', mail: 'essai', erreur: 'RESEND_API_KEY absente' }
    try {
      await envoyerMail(
        { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
        {
          fromName: 'Braaise',
          replyTo: ADRESSE_REPONSE,
          to: [opts.essai],
          subject: `[essai] ${mail.subject}`,
          text: mail.text,
          html: mail.html,
        },
      )
      return { id: row.id, type: row.type, push: 'non tenté (essai)', mail: `essai vers ${opts.essai}`, erreur: null }
    } catch (e) {
      return { id: row.id, type: row.type, push: 'non tenté (essai)', mail: 'échec', erreur: String((e as Error).message ?? e).slice(0, 300) }
    }
  }

  // --- Le vrai envoi : chaque canal est réglé pour son compte ----------------------------------
  const erreurs: string[] = []
  let pushEtat = row.push_le ? 'déjà fait' : ''
  let mailEtat = row.mail_le ? 'déjà fait' : ''
  let pushRegle = Boolean(row.push_le)
  let mailRegle = Boolean(row.mail_le)

  if (!row.push_le) {
    const r = await pousser(row.user_id, push, `${opts.appUrl}/notifications`)
    pushEtat = r.ok ? 'envoyé' : r.detail
    if (r.ok || !r.bloque) pushRegle = true
    if (!r.ok) erreurs.push(`push : ${r.detail}`)
  }

  if (!row.mail_le) {
    const to = await destinataire(row.user_id)
    if (!to) {
      mailEtat = 'aucune adresse pour ce compte'
      mailRegle = true
      erreurs.push('mail : aucune adresse pour ce compte')
    } else if (!RESEND_API_KEY) {
      mailEtat = 'RESEND_API_KEY absente'
      erreurs.push('mail : RESEND_API_KEY absente')
    } else {
      try {
        await envoyerMail(
          { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
          {
            fromName: 'Braaise',
            replyTo: ADRESSE_REPONSE,
            to: [to],
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          },
        )
        mailEtat = 'envoyé'
        mailRegle = true
      } catch (e) {
        mailEtat = 'échec'
        erreurs.push(`mail : ${String((e as Error).message ?? e).slice(0, 200)}`)
      }
    }
  }

  await admin.rpc('marquer_notification_artisan', {
    p_id: row.id,
    p_push: pushRegle,
    p_mail: mailRegle,
    p_erreur: erreurs.length ? erreurs.join(' | ') : null,
  })

  return { id: row.id, type: row.type, push: pushEtat, mail: mailEtat, erreur: erreurs.length ? erreurs.join(' | ') : null }
}

async function lister(reserver: boolean): Promise<NotifRow[] | string> {
  const { data, error } = await admin.rpc('notifications_artisan_a_envoyer', {
    p_reserver: reserver,
    p_max: 20,
  })
  if (error) return error.message
  return (Array.isArray(data) ? data : []) as NotifRow[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)

  try {
    if (!(await cronAllowed(req))) return json({ error: 'non autorisé' }, 401)

    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const mode = typeof body.mode === 'string' ? body.mode : 'traiter'
    const reglage = await reglages(['notifications_artisan_actives', 'app_url'])
    const appUrl = (reglage.app_url || APP_URL_DEFAUT).replace(/\/+$/, '')

    if (mode === 'apercu') {
      const enAttente = await lister(false)
      if (typeof enAttente === 'string') return json({ error: enAttente }, 500)
      return json({
        arme: reglage.notifications_artisan_actives === 'oui',
        en_attente: enAttente.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          type: r.type,
          ref: r.ref,
          tentatives: r.tentative,
          push: r.push_le ? 'fait' : 'à faire',
          mail: r.mail_le ? 'fait' : 'à faire',
        })),
      })
    }

    if (mode === 'essai') {
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      if (!email.includes('@')) return json({ error: 'email requis en mode essai' }, 400)
      // Un essai avec `id` porte sur une ligne précise (celle qu'on vient de provoquer) ; sans lui,
      // on prend ce qui attend. Dans les deux cas rien n'est réservé ni marqué en base.
      const files = await lister(false)
      if (typeof files === 'string') return json({ error: files }, 500)
      const ciblées = typeof body.id === 'string' ? files.filter((r) => r.id === body.id) : files
      const resultats = []
      for (const row of ciblées) resultats.push(await traiterUne(row, { appUrl, essai: email }))
      return json({ mode: 'essai', vers: email, traitees: resultats.length, resultats })
    }

    if (mode !== 'traiter') return json({ error: `mode inconnu: ${mode}` }, 400)

    if (reglage.notifications_artisan_actives !== 'oui') {
      const enAttente = await lister(false)
      if (typeof enAttente === 'string') return json({ error: enAttente }, 500)
      return json({
        desactive: true,
        en_attente: enAttente.length,
        armer: 'notifications_artisan_actives = oui',
      })
    }

    const files = await lister(true)
    if (typeof files === 'string') return json({ error: files }, 500)
    const resultats = []
    for (const row of files) resultats.push(await traiterUne(row, { appUrl }))

    return json({
      traitees: resultats.length,
      envoyes: resultats.filter((r) => r.erreur === null).length,
      resultats,
    })
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
