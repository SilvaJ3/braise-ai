// Demandes d'accès — le formulaire du site, et la validation côté administrateur.
//
// Trois entrées, une seule fonction :
//   POST sans jeton → le site envoie une demande (JSON). Elle est rangée, l'administrateur est
//                     prévenu par mail avec un jeton de validation. Rien d'autre ne se passe.
//   GET  avec jeton → page de confirmation. Sans effet, exprès : un lien de mail peut être
//                     ouvert par un antivirus ou un aperçu automatique.
//   POST avec jeton → « valider » ou « refuser ». Valider crée l'invitation nominative
//                     (`invitation_creer`) et envoie le lien d'inscription à la personne ;
//                     le jeton est alors effacé, donc un second clic ne renvoie rien.
//
// Secrets attendus : RESEND_API_KEY et MAIL_DOMAIN (déjà utilisés par `depot`), ADMIN_EMAIL
// (l'adresse qui reçoit les notifications) et APP_URL (la base des liens d'inscription).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  champTexte,
  dateLisible,
  destinatairesAdmin,
  emailDemandeInvalide,
  jeton,
  mailInvitation,
  mailNotification,
  MESSAGES_DEMANDE,
  normaliserEmailDemande,
  pageSuite,
  pageValidation,
  type Suite,
} from '../_shared/demande-acces.ts'
import { envoyerMail } from '../_shared/mailer.ts'
import { mailHtml } from '../_shared/mail-html.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

// Un formulaire de contact tient en quelques centaines d'octets.
const MAX_BODY_BYTES = 4 * 1024
// Un humain laisse une demande, puis attend. Trois par heure et par adresse IP laissent de la
// place à une correction, et ferment la porte au martèlement.
const MAX_DEMANDES_PAR_HEURE = 3
const VALIDITE_JOURS = 30

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()
const MAIL_DOMAIN = Deno.env.get('MAIL_DOMAIN')?.trim() || 'braaise.io'
// Surcharges possibles par secret ; à défaut, les valeurs vivent en base (`reglages_produit`),
// qui se change sans redéploiement.
const ADMIN_EMAIL_ENV = Deno.env.get('ADMIN_EMAIL')?.trim()
const APP_URL_ENV = Deno.env.get('APP_URL')?.trim()

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

type LigneDemande = {
  id: string
  email: string
  atelier: string | null
  message: string | null
  statut: 'nouvelle' | 'validee' | 'refusee'
  created_at: string
}

/**
 * Adresse de notification et base des liens. Le défaut n'est pas là pour faire joli : sans lui,
 * une table illisible enverrait une invitation vers une URL cassée.
 */
async function reglages(): Promise<{ adminEmails: string[]; replyTo: string; appUrl: string }> {
  const { data, error } = await admin
    .from('reglages_produit')
    .select('cle, valeur')
    .in('cle', ['admin_email', 'app_url'])
  if (error) console.error('[demande-acces] reglages', error)
  const lus = new Map((data ?? []).map((r) => [r.cle as string, r.valeur as string]))
  // `admin_email` accepte plusieurs adresses séparées par une virgule : le temps qu'une boîte se
  // mette en place, la notification part vers les deux et rien ne se perd.
  const destinataires = destinatairesAdmin(ADMIN_EMAIL_ENV || lus.get('admin_email') || '')
  const adminEmails = destinataires.length ? destinataires : ['contact@braaise.io']
  return {
    adminEmails,
    // Les réponses à nos mails doivent arriver à une seule adresse : la première.
    replyTo: adminEmails[0],
    appUrl: (APP_URL_ENV || lus.get('app_url') || 'https://braise-ai.vercel.app').replace(/\/+$/, ''),
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function pageHtml(r: { statut: number; html: string }): Response {
  return new Response(r.html, {
    status: r.statut,
    headers: { ...CORS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function ipDe(req: Request): string | null {
  const brut = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return brut ? brut.slice(0, 64) : null
}

async function compteExiste(email: string): Promise<boolean> {
  const { data, error } = await admin.rpc('compte_existe', { p_email: email })
  if (error) {
    // Un doute ne doit pas bloquer la demande : on prévient juste l'administrateur.
    console.error('[demande-acces] compte_existe', error)
    return false
  }
  return data === true
}

async function tropDeDemandes(ip: string | null): Promise<boolean> {
  if (!ip) return false
  const depuis = new Date(Date.now() - 3_600_000).toISOString()
  const { count, error } = await admin
    .from('demandes_acces')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gt('created_at', depuis)
  if (error) {
    // Un compteur illisible ne ferme pas la porte à une vraie demande.
    console.error('[demande-acces] compteur', error)
    return false
  }
  return (count ?? 0) >= MAX_DEMANDES_PAR_HEURE
}

async function dejaEnAttente(email: string): Promise<boolean> {
  const depuis = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const { count, error } = await admin
    .from('demandes_acces')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('statut', 'nouvelle')
    .gt('created_at', depuis)
  if (error) {
    console.error('[demande-acces] doublon', error)
    return false
  }
  return (count ?? 0) > 0
}

/** Une demande venue du site : on range, on prévient, on ne crée rien. */
async function recevoirDemande(req: Request): Promise<Response> {
  const texte = await req.text()
  if (texte.length > MAX_BODY_BYTES) return json({ error: MESSAGES_DEMANDE.erreur }, 413)

  let corps: Record<string, unknown>
  try {
    corps = JSON.parse(texte) as Record<string, unknown>
  } catch {
    return json({ error: MESSAGES_DEMANDE.erreur }, 400)
  }

  // Piège à robots : le champ caché reste vide chez un humain. Rempli, on répond exactement
  // comme à un humain sans rien créer — inutile d'apprendre au robot qu'il a été vu.
  if (champTexte(corps.piege, 50)) return json({ ok: true, message: MESSAGES_DEMANDE.ok })

  const email = normaliserEmailDemande(corps.email)
  const souci = emailDemandeInvalide(email)
  if (souci) return json({ error: souci }, 400)

  if (await tropDeDemandes(ipDe(req))) return json({ error: MESSAGES_DEMANDE.trop }, 429)
  // Même adresse, demande encore en attente : inutile d'en créer une seconde (l'administrateur
  // recevrait deux mails identiques, et la personne croirait qu'on l'ignore).
  if (await dejaEnAttente(email)) return json({ ok: true, message: MESSAGES_DEMANDE.ok })

  const atelier = champTexte(corps.atelier, 120)
  const message = champTexte(corps.message, 600)
  const jetonValidation = jeton()

  const { data, error } = await admin
    .from('demandes_acces')
    .insert({
      email,
      atelier,
      message,
      jeton: jetonValidation,
      ip: ipDe(req),
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    })
    .select('id, created_at')
    .single<{ id: string; created_at: string }>()

  if (error || !data) {
    console.error('[demande-acces] insert', error)
    return json({ error: MESSAGES_DEMANDE.erreur }, 500)
  }

  const dejaCompte = await compteExiste(email)
  const reglage = await reglages()
  const mail = mailNotification({
    email,
    atelier,
    message,
    lien: `${SUPABASE_URL}/functions/v1/demande-acces?t=${jetonValidation}`,
    recueLe: dateLisible(data.created_at),
    ip: ipDe(req),
    dejaCompte,
  })

  try {
    if (!RESEND_API_KEY) throw new Error('secret RESEND_API_KEY manquant')
    await envoyerMail(
      { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
      {
        // La personne répond à ce mail : sa réponse doit arriver à l'administrateur.
        fromName: 'Braaise',
        replyTo: email,
        to: reglage.adminEmails,
        subject: mail.subject,
        text: mail.text,
        html: mailHtml(mail.mise),
      },
    )
  } catch (e) {
    // Sans notification, personne ne saura jamais qu'une demande existe : on retire la ligne
    // pour que la personne puisse réessayer, et on le lui dit.
    console.error('[demande-acces] notification', e)
    await admin.from('demandes_acces').delete().eq('id', data.id)
    return json({ error: MESSAGES_DEMANDE.erreur }, 500)
  }

  return json({ ok: true, message: MESSAGES_DEMANDE.ok })
}

/** Retrouve une demande par son jeton. `null` = jeton inconnu. */
async function parJeton(t: string): Promise<LigneDemande | null> {
  const { data, error } = await admin
    .from('demandes_acces')
    .select('id, email, atelier, message, statut, created_at')
    .eq('jeton', t)
    .maybeSingle<LigneDemande>()
  if (error) {
    console.error('[demande-acces] jeton', error)
    return null
  }
  return data
}

/** « Valider » et « refuser » ne sont pas des liens : ce sont deux boutons d'un même formulaire. */
async function traiterValidation(req: Request, t: string): Promise<{ statut: number; html: string }> {
  const ligne = await parJeton(t)
  if (!ligne) return pageSuite({ cas: 'jeton_inconnu' })
  if (ligne.statut !== 'nouvelle') return pageSuite({ cas: 'deja_traitee' })

  const form = await req.formData().catch(() => null)
  const action = form?.get('action')
  const traiteeAt = new Date().toISOString()

  if (action === 'refuser') {
    const { error } = await admin
      .from('demandes_acces')
      .update({ statut: 'refusee', jeton: null, traitee_at: traiteeAt })
      .eq('id', ligne.id)
      .eq('statut', 'nouvelle')
    if (error) {
      console.error('[demande-acces] refus', error)
      return pageSuite({ cas: 'erreur' })
    }
    return pageSuite({ cas: 'refusee', email: ligne.email })
  }

  if (action !== 'valider') return pageSuite({ cas: 'erreur' })

  // Note d'origine : l'administrateur doit pouvoir retrouver d'où vient ce code.
  const note = `Demande du site${ligne.atelier ? ` — ${ligne.atelier}` : ''}`.slice(0, 200)

  const { data: code, error: errCode } = await admin.rpc('invitation_creer', {
    p_note: note,
    // Nominatif : l'invitation ne vaut que pour cette adresse, et le lien la pré-remplit.
    p_email: ligne.email,
    p_plan: 'fondateur',
    p_validite_jours: VALIDITE_JOURS,
  })

  if (errCode || typeof code !== 'string') {
    console.error('[demande-acces] invitation_creer', errCode)
    return pageSuite({ cas: 'erreur' })
  }

  const reglage = await reglages()
  const lien = `${reglage.appUrl}/inscription?code=${encodeURIComponent(code)}&email=${encodeURIComponent(ligne.email)}`
  const mail = mailInvitation({ email: ligne.email, code, lien, validiteJours: VALIDITE_JOURS })

  try {
    if (!RESEND_API_KEY) throw new Error('secret RESEND_API_KEY manquant')
    await envoyerMail(
      { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
      {
        fromName: 'Braaise',
        replyTo: reglage.replyTo,
        to: [ligne.email],
        subject: mail.subject,
        text: mail.text,
        html: mailHtml(mail.mise),
      },
    )
  } catch (e) {
    // Le code existe mais n'est jamais parti : on garde le jeton pour pouvoir réessayer, et on
    // le dit — un « c'est envoyé » faux serait pire que l'erreur.
    console.error('[demande-acces] invitation', e)
    return pageSuite({ cas: 'erreur' })
  }

  const { error: errMaj } = await admin
    .from('demandes_acces')
    .update({ statut: 'validee', jeton: null, traitee_at: traiteeAt, invitation_code: code })
    .eq('id', ligne.id)
  if (errMaj) console.error('[demande-acces] trace', errMaj)

  return pageSuite({ cas: 'validee', email: ligne.email, code })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const t = new URL(req.url).searchParams.get('t')?.trim() ?? ''

  // Sans jeton : c'est le site qui parle.
  if (!t) {
    if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)
    return recevoirDemande(req)
  }

  // Un jeton a une forme connue : inutile d'aller en base pour une chaîne qui n'en est pas un.
  if (t.length < 16 || t.length > 64) return pageHtml(pageSuite({ cas: 'jeton_inconnu' }))

  if (req.method === 'GET') {
    const ligne = await parJeton(t)
    if (!ligne) return pageHtml(pageSuite({ cas: 'jeton_inconnu' }))
    if (ligne.statut !== 'nouvelle') return pageHtml(pageSuite({ cas: 'deja_traitee' }))
    return pageHtml(
      pageValidation({
        email: ligne.email,
        atelier: ligne.atelier,
        message: ligne.message,
        jeton: t,
        recueLe: dateLisible(ligne.created_at),
        dejaCompte: await compteExiste(ligne.email),
      }),
    )
  }

  if (req.method === 'POST') return pageHtml(await traiterValidation(req, t))

  return json({ error: 'GET ou POST uniquement' }, 405)
})
