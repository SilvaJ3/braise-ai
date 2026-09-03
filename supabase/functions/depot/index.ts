// Bon de dépôt (V4) : génère le PDF signé, le range dans Storage et l'envoie par mail à la
// boutique (copie à l'artisane). Le PDF et l'envoi vivent ici : la clé du service de mail
// ne quitte jamais le serveur.
//
// Modes :
//   apercu  → renvoie le PDF en base64, n'écrit rien (bouton « Aperçu » avant signature)
//   envoyer → fige la signature + le numéro, stocke le PDF, envoie le mail
//
// Les mails partent du service de l'application (Resend, domaine MAIL_DOMAIN) : l'utilisateur
// n'a aucun réglage technique à faire. Secrets attendus : RESEND_API_KEY, MAIL_DOMAIN.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  emailBody,
  emailSubject,
  numeroSuivant,
  parseEmails,
  pdfFilename,
  problemesEnvoi,
  type DepotDoc,
  type Emetteur,
} from '../_shared/depot-doc.ts'
import { renderDepotPdf } from '../_shared/depot-pdf.ts'
import { aliasDepuisNom, envoyerMail } from '../_shared/mailer.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()
const MAIL_DOMAIN = Deno.env.get('MAIL_DOMAIN')?.trim() || 'braise.io'

const BUCKET = 'depots'
const MAX_SIGNATURE_CHARS = 400_000

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

const DEFAULT_EMETTEUR: Emetteur = {
  nom: '',
  adresse: '',
  telephone: '',
  tva: '',
  email: '',
  mention_signature: "EN SIGNANT, J'ACCEPTE LES CONDITIONS GÉNÉRALES INDIQUÉES DANS LE CONTRAT INITIAL :",
}

async function loadEmetteur(userId: string): Promise<Emetteur> {
  const { data } = await admin
    .from('profil_entreprise')
    .select('nom, adresse, telephone, tva, email, mention_signature')
    .eq('user_id', userId)
    .maybeSingle()
  return { ...DEFAULT_EMETTEUR, ...data } as Emetteur
}

/**
 * Adresse d'expédition du compte, créée au premier envoi et jamais changée ensuite : un
 * destinataire qui a déjà reçu un bon doit retrouver le même expéditeur la fois suivante.
 * En cas d'homonymie entre deux comptes, on suffixe (-2, -3…).
 */
async function aliasMail(userId: string, nom: string): Promise<string> {
  const { data } = await admin
    .from('profil_entreprise')
    .select('alias_mail')
    .eq('user_id', userId)
    .maybeSingle()
  if (data?.alias_mail) return data.alias_mail as string

  const souhaite = aliasDepuisNom(nom)
  for (let i = 1; i <= 20; i++) {
    const candidat = i === 1 ? souhaite : `${souhaite}-${i}`
    const { error } = await admin
      .from('profil_entreprise')
      .update({ alias_mail: candidat })
      .eq('user_id', userId)
    // 23505 = violation d'unicité : l'alias est déjà pris par un autre compte.
    if (!error) return candidat
    if (error.code !== '23505') throw new Error(error.message)
  }
  // Repli impossible à collisionner.
  const secours = `bons-${userId.slice(0, 8)}`
  await admin.from('profil_entreprise').update({ alias_mail: secours }).eq('user_id', userId)
  return secours
}

type DepotRow = {
  id: string
  user_id: string
  numero: string | null
  date_depot: string
  statut: string
  boutique_nom: string
  boutique_adresse: string | null
  boutique_email: string | null
  notes: string | null
  signataire_nom: string | null
  signature_image: string | null
  signed_at: string | null
  pdf_path: string | null
}

async function loadDepot(userId: string, depotId: string): Promise<{ row: DepotRow; doc: DepotDoc } | null> {
  const { data: row } = await admin
    .from('depots')
    .select('id, user_id, numero, date_depot, statut, boutique_nom, boutique_adresse, boutique_email, notes, signataire_nom, signature_image, signed_at, pdf_path')
    .eq('id', depotId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!row) return null

  const { data: lignes } = await admin
    .from('depot_lignes')
    .select('designation, quantite, prix_unitaire, position')
    .eq('depot_id', depotId)
    .order('position')
    .order('created_at')

  const doc: DepotDoc = {
    numero: row.numero,
    date_depot: row.date_depot,
    emetteur: await loadEmetteur(userId),
    boutique_nom: row.boutique_nom,
    boutique_adresse: row.boutique_adresse,
    boutique_email: row.boutique_email,
    lignes: (lignes ?? []).map((l) => ({
      designation: l.designation as string,
      quantite: Number(l.quantite),
      prix_unitaire: Number(l.prix_unitaire),
    })),
    notes: row.notes,
    signataire_nom: row.signataire_nom,
    signature_image: row.signature_image,
  }
  return { row: row as DepotRow, doc }
}

const toBase64 = (bytes: Uint8Array): string => {
  // btoa ne prend qu'une chaîne : on découpe pour ne pas dépasser la pile sur un gros PDF.
  let s = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    s += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(s)
}

/** Numéro AAAA-NNN, calculé sur les bons déjà numérotés de l'année. */
async function attribuerNumero(userId: string, dateDepot: string): Promise<string> {
  const annee = Number(dateDepot.slice(0, 4))
  const { count } = await admin
    .from('depots')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('numero', 'is', null)
    .gte('date_depot', `${annee}-01-01`)
    .lte('date_depot', `${annee}-12-31`)
  return numeroSuivant(annee, count ?? 0)
}

async function handleApercu(userId: string, body: Record<string, unknown>): Promise<Response> {
  const loaded = await loadDepot(userId, String(body.depot_id ?? ''))
  if (!loaded) return json({ error: 'bon de dépôt introuvable' }, 404)
  const doc = loaded.doc
  // Aperçu avant signature : on montre le document tel qu'il sera, signature comprise si
  // elle vient d'être tracée dans le formulaire.
  if (typeof body.signature_image === 'string' && body.signature_image) {
    doc.signature_image = body.signature_image.slice(0, MAX_SIGNATURE_CHARS)
  }
  if (typeof body.signataire_nom === 'string') doc.signataire_nom = body.signataire_nom.slice(0, 200)
  if (!doc.lignes.length) return json({ error: 'ajoute au moins un article' }, 400)
  try {
    return json({ pdf_base64: toBase64(renderDepotPdf(doc)), filename: pdfFilename(doc) })
  } catch (e) {
    console.error('renderDepotPdf', e)
    return json({ error: `génération du PDF impossible : ${String((e as Error).message ?? e).slice(0, 200)}` }, 500)
  }
}

async function handleEnvoyer(userId: string, body: Record<string, unknown>): Promise<Response> {
  if (!RESEND_API_KEY) {
    return json({ error: "Le service d'envoi de mail n'est pas configuré (secret RESEND_API_KEY)." }, 500)
  }
  const loaded = await loadDepot(userId, String(body.depot_id ?? ''))
  if (!loaded) return json({ error: 'bon de dépôt introuvable' }, 404)
  const { row, doc } = loaded

  // Signature : celle qui vient d'être tracée prime ; sinon on réutilise celle déjà figée
  // (réessai d'envoi après un échec, sans refaire signer la boutique).
  if (typeof body.signature_image === 'string' && body.signature_image) {
    doc.signature_image = body.signature_image.replace(/^data:[^;]+;base64,/, '').slice(0, MAX_SIGNATURE_CHARS)
  }
  if (typeof body.signataire_nom === 'string' && body.signataire_nom.trim()) {
    doc.signataire_nom = body.signataire_nom.trim().slice(0, 200)
  }

  const to = parseEmails(String(body.email_to ?? '')).valid
  const cc = parseEmails(String(body.email_cc ?? '')).valid
  const problemes = problemesEnvoi(doc, [...to, ...cc])
  if (problemes.length) return json({ error: problemes.join(' ') }, 400)

  if (!doc.numero) doc.numero = await attribuerNumero(userId, doc.date_depot)

  let pdf: Uint8Array
  try {
    pdf = renderDepotPdf(doc)
  } catch (e) {
    console.error('renderDepotPdf', e)
    return json({ error: `génération du PDF impossible : ${String((e as Error).message ?? e).slice(0, 200)}` }, 500)
  }

  const path = `${userId}/${row.id}.pdf`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  if (upErr) console.error('storage.upload', upErr.message)

  // Le bon est figé dès maintenant : si le mail échoue, la signature et le numéro restent
  // acquis et l'envoi peut être relancé sans refaire signer.
  await admin
    .from('depots')
    .update({
      numero: doc.numero,
      statut: 'signe',
      signataire_nom: doc.signataire_nom,
      signature_image: doc.signature_image,
      signed_at: row.signed_at ?? new Date().toISOString(),
      pdf_path: upErr ? null : path,
      email_to: to,
      email_cc: cc,
      send_error: null,
    })
    .eq('id', row.id)

  try {
    await envoyerMail(
      { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
      {
        fromName: doc.emetteur.nom,
        fromAlias: await aliasMail(userId, doc.emetteur.nom),
        // Les réponses des boutiques arrivent directement dans la boîte de l'utilisateur.
        replyTo: doc.emetteur.email || undefined,
        to,
        cc,
        subject: emailSubject(doc),
        text: emailBody(doc),
        attachments: [{ filename: pdfFilename(doc), base64: toBase64(pdf) }],
      },
    )
  } catch (e) {
    const message = String((e as Error).message ?? e).slice(0, 500)
    console.error('envoyerMail', message)
    await admin.from('depots').update({ send_error: message }).eq('id', row.id)
    return json({ error: `Bon signé et enregistré, mais l'envoi du mail a échoué : ${message}`, numero: doc.numero, signe: true }, 502)
  }

  await admin
    .from('depots')
    .update({ statut: 'envoye', sent_at: new Date().toISOString(), send_error: null })
    .eq('id', row.id)

  return json({ numero: doc.numero, sent_to: [...to, ...cc], pdf_path: upErr ? null : path })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: userData, error } = await admin.auth.getUser(token)
    if (error || !userData.user) return json({ error: 'non authentifié' }, 401)

    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const mode = body.mode ?? 'apercu'
    if (mode === 'apercu') return await handleApercu(userData.user.id, body)
    if (mode === 'envoyer') return await handleEnvoyer(userData.user.id, body)
    return json({ error: `mode inconnu: ${mode}` }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
