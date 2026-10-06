// Bon de dépôt (V4) : génère le PDF signé, le range dans Storage et l'envoie par mail à la
// boutique (copie à l'artisan). Le PDF et l'envoi vivent ici : la clé du service de mail
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
  isEmail,
  parseEmails,
  pdfFilename,
  problemesEnvoi,
  type DepotDoc,
  type Emetteur,
  type ModeVente,
} from '../_shared/depot-doc.ts'
import { renderDepotPdf } from '../_shared/depot-pdf.ts'
import { baseLienBoutique, lienBoutique } from '../_shared/lien-boutique.ts'
import { construireMailBon } from '../_shared/mail-bon.ts'
import { envoyerMail } from '../_shared/mailer.ts'
import { construirePresentation, fautPresenter } from '../_shared/presentation-boutique.ts'
import { accesDuCompte } from '../_shared/essai-rpc.ts'
import { destinatairesDeCompte } from '../_shared/demo.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()
const MAIL_DOMAIN = Deno.env.get('MAIL_DOMAIN')?.trim() || 'braaise.io'

const BUCKET = 'depots'
const MAX_SIGNATURE_CHARS = 400_000
const MAX_PHOTO_CHARS = 2_000_000
/** Bons envoyés par compte et par jour : large pour un atelier (une dizaine de boutiques), étroit pour un relais de spam. */
const ENVOIS_MAX_PAR_JOUR = 30

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

type DepotRow = {
  id: string
  user_id: string
  boutique_id: string | null
  mode: ModeVente
  numero: string | null
  date_depot: string
  statut: string
  boutique_nom: string
  boutique_adresse: string | null
  boutique_email: string | null
  notes: string | null
  signataire_nom: string | null
  signature_image: string | null
  photo_image: string | null
  signed_at: string | null
  pdf_path: string | null
  email_to: string[] | null
  email_cc: string[] | null
  sent_at: string | null
}

/**
 * Mode de vente qui s'applique au bon. Un bon non signé suit encore sa boutique (le mode se
 * décide sur la fiche) ; une fois le bon signé, c'est la valeur figée sur le bon qui fait foi,
 * même si la boutique change de mode ensuite. Si le bon a perdu sa boutique (fiche supprimée),
 * la valeur figée est tout ce qui reste.
 */
async function modeDuBon(row: { boutique_id: string | null; user_id: string; mode: ModeVente; signed_at: string | null }): Promise<ModeVente> {
  if (!row.boutique_id || row.signed_at) return row.mode
  const { data } = await admin
    .from('boutiques')
    .select('mode')
    .eq('id', row.boutique_id)
    .eq('user_id', row.user_id)
    .maybeSingle()
  return ((data?.mode as ModeVente | undefined) ?? row.mode)
}

async function loadDepot(userId: string, depotId: string): Promise<{ row: DepotRow; doc: DepotDoc } | null> {
  const { data: row } = await admin
    .from('depots')
    .select('id, user_id, boutique_id, mode, numero, date_depot, statut, boutique_nom, boutique_adresse, boutique_email, notes, signataire_nom, signature_image, photo_image, signed_at, pdf_path, email_to, email_cc, sent_at')
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
    mode: await modeDuBon(row as DepotRow),
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
    photo_image: row.photo_image,
  }
  return { row: row as DepotRow, doc }
}

/**
 * Adresses vers lesquelles l'utilisateur peut envoyer un bon : le contact figé du bon, sa propre
 * adresse d'émetteur, et les adresses de ses fiches boutique. Ces adresses sont saisies par
 * l'utilisateur lui-même : le filtre écarte une faute de frappe dans le formulaire d'envoi, il ne
 * prouve pas qu'une adresse appartient à la boutique (voir le plafond quotidien dans `handleEnvoyer`).
 */
async function adressesAutorisees(userId: string, doc: DepotDoc): Promise<Set<string>> {
  const set = new Set<string>()
  const add = (e?: string | null) => {
    if (e && isEmail(e)) set.add(e.trim().toLowerCase())
  }
  add(doc.boutique_email)
  add(doc.emetteur.email)
  const { data } = await admin
    .from('boutiques')
    .select('email')
    .eq('user_id', userId)
    .not('email', 'is', null)
  for (const b of data ?? []) add(b.email as string)
  return set
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

/** Le lien d'une boutique, et l'adresse à laquelle il appartient (c'est elle qui reçoit le mail). */
type LienBoutique = { url: string; email: string }

const SANS_LIEN: LienBoutique = { url: '', email: '' }

/**
 * L'adresse de la boutique, telle qu'elle la retrouvera dans le pied du mail. Le lien est créé au
 * premier bon (c'est la même logique que le bouton « Copier le lien » de l'écran) — SAUF si
 * l'accès a été coupé exprès : un bon ne doit pas rouvrir en douce ce que l'artisan a fermé.
 *
 * Une adresse introuvable ne bloque pas l'envoi : le mail part sans lien, et le dit.
 */
async function lienDeLaBoutique(userId: string, boutiqueId: string | null): Promise<LienBoutique> {
  if (!boutiqueId) return SANS_LIEN

  const { data: partenaire } = await admin
    .from('boutique_lien_partenaires')
    .select('actif')
    .eq('user_id', userId)
    .eq('boutique_id', boutiqueId)
    .maybeSingle()
  if (partenaire && partenaire.actif === false) return SANS_LIEN

  const { data, error } = await admin.rpc('lien_boutique_assurer', {
    p_user: userId,
    p_boutique: boutiqueId,
  })
  if (error) {
    console.error('lien_boutique_assurer', error.message)
    return SANS_LIEN
  }
  const jeton = (data as { jeton?: string } | null)?.jeton
  const email = String((data as { email?: string } | null)?.email ?? '').trim().toLowerCase()
  if (!jeton) return { url: '', email }

  // Le lien de la boutique pointe le **site** (celui qui sert la page), pas l'app : c'est la seule
  // adresse que la boutique garde — voir `_shared/lien-boutique.ts`.
  const { data: reglage } = await admin
    .from('reglages_produit')
    .select('valeur')
    .eq('cle', 'site_url')
    .maybeSingle()
  const base = baseLienBoutique(reglage?.valeur as string | undefined)
  return { url: base ? lienBoutique(base, jeton) : '', email }
}

/**
 * Le mail de présentation, la première fois que le lien d'une boutique existe — c'est-à-dire au
 * premier bon qu'on lui envoie.
 *
 * POURQUOI ICI, et pas à l'armement des rappels : le lien naît à ce moment-là (le pied du bon le
 * porte déjà), et la décision du 20/09/2026 est qu'aucune boutique ne reçoive un rappel mensuel
 * avant d'avoir vu ce que c'est. Le geste de l'artisan (envoyer le bon) est ce qui déclenche, il n'y
 * a donc rien de nouveau à armer ni à cliquer ; et la preuve d'envoi vit sur le lien
 * (`boutique_liens.presentation_envoyee_le`, migration 0066), jamais dans la mémoire du serveur.
 *
 * Deux choses que ce n'est pas : ce n'est pas un motif d'échec pour le bon (le bon, lui, est déjà
 * parti et reste acquis), et ce n'est pas une deuxième présentation — un envoi réussi ferme la
 * porte pour de bon.
 */
async function presenterLaBoutique(lien: LienBoutique, doc: DepotDoc, redirection: string | null = null): Promise<void> {
  // Sans clé d'envoi il n'y a pas de présentation possible — et surtout pas d'échec à remonter :
  // le bon, lui, est déjà parti.
  if (!lien.email || !RESEND_API_KEY) return

  const { data: ligne, error } = await admin
    .from('boutique_liens')
    .select('id, presentation_envoyee_le')
    .eq('email', lien.email)
    .maybeSingle()
  if (error) {
    // Sans le marqueur (0066 non appliquée), on ne présente pas plutôt que deux fois : l'absence de
    // preuve n'est pas une permission d'envoyer.
    console.error('présentation boutique : marqueur indisponible', error.message)
    return
  }
  if (!ligne || !fautPresenter(lien.url, ligne.presentation_envoyee_le as string | null)) return

  const mail = construirePresentation({
    artisan: doc.emetteur.nom,
    boutique: doc.boutique_nom,
    lien: lien.url,
  })
  await envoyerMail(
    { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
    {
      fromName: doc.emetteur.nom || 'Suivi des dépôts',
      replyTo: doc.emetteur.email || undefined,
      // L'adresse du lien, pas celles du bon : c'est la boutique qui a reçu le lien qui le reçoit —
      // sauf compte de démonstration, où rien ne doit sortir (l'adresse du compte est passée ici).
      to: [redirection || lien.email],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    },
  )

  // La date n'est posée qu'après l'envoi : un échec laisse la présentation possible au bon suivant,
  // là où un marqueur posé d'avance l'aurait perdue pour de bon.
  await admin
    .from('boutique_liens')
    .update({ presentation_envoyee_le: new Date().toISOString() })
    .eq('id', ligne.id)
}

/**
 * Numéro AAAA-NNN, attribué par la base de façon atomique.
 *
 * Avant : un count(*) des bons de l'année suivi d'une écriture. Deux signatures concurrentes
 * lisaient le même compte et obtenaient le même numéro, et supprimer un bon faisait RECULER le
 * compteur — un numéro déjà émis sur un document signé pouvait donc être réattribué à un autre.
 * Le compteur vit maintenant dans public.depot_numeros, incrémenté par une seule instruction.
 */
async function attribuerNumero(_userId: string, dateDepot: string): Promise<string> {
  const annee = Number(dateDepot.slice(0, 4))
  const { data, error } = await admin.rpc('depot_numero_suivant', { p_annee: annee })
  if (error || !data) {
    throw new Error(`attribution du numéro impossible : ${error?.message ?? 'réponse vide'}`)
  }
  return data as string
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
  if (typeof body.photo_image === 'string' && body.photo_image) {
    doc.photo_image = body.photo_image.replace(/^data:[^;]+;base64,/, '').slice(0, MAX_PHOTO_CHARS)
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

async function handleEnvoyer(userId: string, body: Record<string, unknown>, demo = false): Promise<Response> {
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
  // Photo : idem, celle qui vient d'être prise prime ; sinon on réutilise celle déjà figée.
  if (typeof body.photo_image === 'string' && body.photo_image) {
    doc.photo_image = body.photo_image.replace(/^data:[^;]+;base64,/, '').slice(0, MAX_PHOTO_CHARS)
  }
  if (typeof body.signataire_nom === 'string' && body.signataire_nom.trim()) {
    doc.signataire_nom = body.signataire_nom.trim().slice(0, 200)
  }

  const to = parseEmails(String(body.email_to ?? '')).valid
  const cc = parseEmails(String(body.email_cc ?? '')).valid
  const problemes = problemesEnvoi(doc, [...to, ...cc])
  if (problemes.length) return json({ error: problemes.join(' ') }, 400)

  // Le domaine d'envoi est celui, vérifié, de l'application : on n'envoie qu'aux adresses de ses
  // fiches boutique et à la sienne, jamais à un tiers saisi dans le formulaire d'envoi. Attention :
  // l'adresse d'une fiche est écrite librement par l'artisan, ce filtre ne prouve donc PAS qu'elle
  // appartient à la boutique — le plafond quotidien ci-dessous est le vrai frein au spam.
  const autorisees = await adressesAutorisees(userId, doc)
  const refuses = [...to, ...cc].filter((e) => !autorisees.has(e.trim().toLowerCase()))
  if (refuses.length) {
    return json(
      {
        error: `Destinataire non autorisé : ${refuses.join(', ')}. Tu ne peux envoyer qu'aux adresses de tes boutiques ou à ta propre adresse (Compte → Mes coordonnées).`,
      },
      403,
    )
  }

  // Plafond d'envois par compte et par jour : un compte qui met l'adresse d'une victime sur une fiche
  // ne peut pas s'en servir pour inonder cette adresse depuis le domaine de l'app. Un échec du compteur
  // laisse passer (même choix que `import` et `assistant`) : on ne coupe pas un artisan pour une panne.
  const { data: quotaOk, error: quotaErr } = await admin.rpc('consommer_quota', {
    p_user: userId,
    p_kind: 'depot_mail',
    p_max: ENVOIS_MAX_PAR_JOUR,
    p_fenetre_sec: 86400,
  })
  if (quotaErr) console.error('[quota depot_mail]', quotaErr)
  else if (quotaOk === false) {
    return json({ error: "Tu as envoyé beaucoup de bons aujourd'hui. Réessaie demain, ou écris-nous si c'est normal." }, 429)
  }

  // Compte de démonstration : les destinataires sont remplacés par l'adresse du compte, et le mail
  // le dit (`_shared/demo.ts`). Le contrôle ci-dessus, lui, a porté sur les adresses VISÉES : c'est
  // bien la boutique qu'on voulait joindre qui a été vérifiée, pas celle à qui l'on écrit.
  const envoi = destinatairesDeCompte(demo, doc.emetteur.email, to, cc)

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
      mode: doc.mode,
      signataire_nom: doc.signataire_nom,
      signature_image: doc.signature_image,
      photo_image: doc.photo_image,
      signed_at: row.signed_at ?? new Date().toISOString(),
      pdf_path: upErr ? null : path,
      email_to: envoi.to,
      email_cc: envoi.cc,
      send_error: null,
    })
    .eq('id', row.id)

  // Le lien est lu (et créé) avant l'envoi du bon : c'est lui qui portera la présentation, et un
  // échec du mail du bon ne doit pas non plus faire perdre la création du lien.
  let lien: LienBoutique = SANS_LIEN
  try {
    lien = await lienDeLaBoutique(userId, row.boutique_id)
    // Version brute ET version mise en page (voir `_shared/mail-bon.ts`) : sans la seconde, le lien
    // de la boutique partait en texte mort, et le client de messagerie n'en faisait pas un lien.
    const mail = construireMailBon(doc, {
      ...(lien.url ? { lien: lien.url } : {}),
      ...(envoi.redirige.length ? { demo: envoi.redirige } : {}),
    })
    await envoyerMail(
      { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
      {
        fromName: doc.emetteur.nom,
        // Les réponses des boutiques arrivent directement dans la boîte de l'utilisateur.
        replyTo: doc.emetteur.email || undefined,
        to: envoi.to,
        cc: envoi.cc,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
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

  // Le bon est parti : la boutique sait qu'elle a des pièces chez elle, et elle découvre le lien
  // dans son pied. On lui explique l'outil maintenant — pas au premier rappel, qui arriverait sans
  // introduction (décision du 20/09/2026). En échec, on le dit dans le journal et le bon suivant
  // réessaiera : la présentation n'a jamais le droit de faire échouer l'envoi du bon.
  try {
    await presenterLaBoutique(lien, doc, envoi.redirige.length ? doc.emetteur.email : null)
  } catch (e) {
    console.error('présenter la boutique', String((e as Error).message ?? e).slice(0, 300))
  }

  return json({ numero: doc.numero, sent_to: [...envoi.to, ...envoi.cc], pdf_path: upErr ? null : path })
}

/**
 * Renvoyer un bon déjà parti — sans refaire signer la boutique.
 *
 * POURQUOI CE MODE EXISTE : un mail peut être mal rendu chez celui qui le reçoit, et le défaut
 * n'est vu qu'après coup — constat de JSB le 27/09/2026, sur le bon 2026-009 : le lien de la
 * boutique était arrivé en texte mort. Le bon, lui, est acquis : refaire signer pour corriger une
 * mise en page serait absurde. On renvoie donc **le même document**, avec **le même lien**, aux
 * **mêmes adresses** (celles figées à l'envoi — jamais un destinataire neuf), et l'objet comme la
 * première phrase annoncent la correction.
 */
async function handleRenvoyer(userId: string, body: Record<string, unknown>, demo = false): Promise<Response> {
  if (!RESEND_API_KEY) {
    return json({ error: "Le service d'envoi de mail n'est pas configuré (secret RESEND_API_KEY)." }, 500)
  }
  const loaded = await loadDepot(userId, String(body.depot_id ?? ''))
  if (!loaded) return json({ error: 'bon de dépôt introuvable' }, 404)
  const { row, doc } = loaded
  if (!doc.numero || row.statut === 'brouillon') {
    return json({ error: "Ce bon n'a pas encore été envoyé : c'est un envoi, pas un renvoi." }, 400)
  }

  // Les adresses du renvoi sont celles de l'envoi, pas une saisie nouvelle : un renvoi ne doit pas
  // pouvoir servir à écrire à quelqu'un d'autre depuis le domaine de l'application.
  const to = (row.email_to ?? []).map((e) => String(e).trim()).filter(isEmail)
  const cc = (row.email_cc ?? []).map((e) => String(e).trim()).filter(isEmail)
  if (!to.length && !cc.length) return json({ error: "Ce bon n'a aucune adresse d'envoi enregistrée." }, 400)
  const autorisees = await adressesAutorisees(userId, doc)
  const refuses = [...to, ...cc].filter((e) => !autorisees.has(e.toLowerCase()))
  if (refuses.length) {
    return json({ error: `Destinataire non autorisé : ${refuses.join(', ')}.` }, 403)
  }

  // Même règle qu'à l'envoi : un compte de démonstration ne fait sortir personne de chez lui.
  const envoi = destinatairesDeCompte(demo, doc.emetteur.email, to, cc)

  // Le PDF déjà archivé est le document que la boutique a reçu : on le renvoie tel quel. S'il a
  // disparu du stockage, on le régénère depuis le bon — jamais de renvoi sans pièce jointe.
  let pdf: Uint8Array | null = null
  if (row.pdf_path) {
    const { data: blob, error } = await admin.storage.from(BUCKET).download(row.pdf_path)
    if (error) console.error('storage.download', error.message)
    if (blob) pdf = new Uint8Array(await blob.arrayBuffer())
  }
  if (!pdf) {
    try {
      pdf = renderDepotPdf(doc)
    } catch (e) {
      console.error('renderDepotPdf', e)
      return json({ error: `génération du PDF impossible : ${String((e as Error).message ?? e).slice(0, 200)}` }, 500)
    }
  }

  const lien = await lienDeLaBoutique(userId, row.boutique_id)
  const mail = construireMailBon(doc, {
    ...(lien.url ? { lien: lien.url } : {}),
    correction: true,
    ...(envoi.redirige.length ? { demo: envoi.redirige } : {}),
  })
  try {
    await envoyerMail(
      { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
      {
        fromName: doc.emetteur.nom,
        replyTo: doc.emetteur.email || undefined,
        to: envoi.to,
        ...(envoi.cc.length ? { cc: envoi.cc } : {}),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: [{ filename: pdfFilename(doc), base64: toBase64(pdf) }],
      },
    )
  } catch (e) {
    const message = String((e as Error).message ?? e).slice(0, 500)
    console.error('envoyerMail (renvoi)', message)
    await admin.from('depots').update({ send_error: message }).eq('id', row.id)
    return json({ error: `Le renvoi a échoué : ${message}` }, 502)
  }

  const envoyeLe = new Date().toISOString()
  await admin
    .from('depots')
    .update({ sent_at: envoyeLe, send_error: null })
    .eq('id', row.id)

  return json({ numero: doc.numero, renvoye_a: [...envoi.to, ...envoi.cc], sent_at: envoyeLe, correction: true })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: userData, error } = await admin.auth.getUser(token)
    if (error || !userData.user) return json({ error: 'non authentifié' }, 401)

    // Le bon de dépôt est ce que l'artisan fait tous les jours : c'est donc lui, et pas seulement
    // l'assistant, qui distingue un compte qui paie d'un compte qui consulte. Passé l'essai, un
    // compte sans abonnement relit ses bons, son planning et son stock — mais n'en émet plus de
    // nouveau, et n'en renvoie plus. La boutique, elle, n'est jamais pénalisée : c'est le geste de
    // l'artisan qui est fermé, pas la page du lien.
    const acces = await accesDuCompte(admin, userData.user.id)
    if (!acces.autorise) return json({ error: acces.message, essai_termine: true }, 402)

    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const mode = body.mode ?? 'apercu'
    if (mode === 'apercu') return await handleApercu(userData.user.id, body)
    if (mode === 'envoyer') return await handleEnvoyer(userData.user.id, body, acces.demo)
    if (mode === 'renvoyer') return await handleRenvoyer(userData.user.id, body, acces.demo)
    return json({ error: `mode inconnu: ${mode}` }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
