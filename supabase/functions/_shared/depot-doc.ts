// Modèle du bon de dépôt : mise en forme des valeurs, totaux, texte du mail.
// TypeScript pur (partagé edge function / front / tests) : pas de pdf-lib, pas de Deno ici,
// le rendu PDF vit dans depot-pdf.ts.

export type Emetteur = {
  nom: string
  adresse: string
  telephone: string
  tva: string
  email: string
  mention_signature: string
}

export type DepotLigne = {
  designation: string
  quantite: number
  prix_unitaire: number
}

export type DepotDoc = {
  numero: string | null
  date_depot: string // AAAA-MM-JJ
  emetteur: Emetteur
  boutique_nom: string
  boutique_adresse: string | null
  boutique_email: string | null
  lignes: DepotLigne[]
  notes: string | null
  signataire_nom: string | null
  /** JPEG base64 (sans préfixe data:) */
  signature_image: string | null
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** "2026-09-03" → "3 septembre 2026". Pas d'Intl : même rendu partout. */
export function fmtDateLongue(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const jour = Number(m[3])
  const mois = MOIS[Number(m[2]) - 1] ?? m[2]
  return `${jour} ${mois} ${m[1]}`
}

/** "2026-09-03" → "03/09/2026" */
export function fmtDateCourte(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Montant en euros, format belge : 40 € / 12,50 € */
export function fmtEuro(n: number): string {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')
  return `${s} €`
}

/** Quantité sans décimale inutile : 3 / 2,5 */
export function fmtQte(n: number): string {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',').replace(/,?0+$/, '')
}

export const totalLigne = (l: DepotLigne): number =>
  Math.round((l.quantite * l.prix_unitaire + Number.EPSILON) * 100) / 100

export const totalDoc = (lignes: DepotLigne[]): number =>
  Math.round((lignes.reduce((s, l) => s + totalLigne(l), 0) + Number.EPSILON) * 100) / 100

export const nbArticles = (lignes: DepotLigne[]): number =>
  Math.round((lignes.reduce((s, l) => s + Number(l.quantite), 0) + Number.EPSILON) * 100) / 100

/** Nom de fichier du PDF : bon-depot-<numéro ou date>.pdf, sans caractère exotique. */
export function pdfFilename(doc: Pick<DepotDoc, 'numero' | 'date_depot'>): string {
  const base = (doc.numero ?? doc.date_depot).replace(/[^A-Za-z0-9_-]+/g, '-')
  return `bon-depot-${base}.pdf`
}

/** Numéro séquentiel par année : 2026-001. */
export function numeroSuivant(annee: number, dejaEmis: number): string {
  return `${annee}-${String(dejaEmis + 1).padStart(3, '0')}`
}

export function emailSubject(doc: DepotDoc): string {
  const ref = doc.numero ? ` n° ${doc.numero}` : ''
  return `Bon de dépôt${ref} — ${doc.emetteur.nom || 'dépôt-vente'} — ${fmtDateCourte(doc.date_depot)}`
}

export function emailBody(doc: DepotDoc): string {
  const lignes = doc.lignes.map((l) => `  • ${l.designation} — ${fmtQte(l.quantite)} × ${fmtEuro(l.prix_unitaire)}`)
  const parts = [
    `Bonjour,`,
    ``,
    `Voici le bon de dépôt${doc.numero ? ` n° ${doc.numero}` : ''} du ${fmtDateLongue(doc.date_depot)} pour ${doc.boutique_nom}, signé, en pièce jointe.`,
    ``,
    `Articles déposés :`,
    ...lignes,
    ``,
    `Total (prix de vente TTC) : ${fmtEuro(totalDoc(doc.lignes))}`,
  ]
  if (doc.notes?.trim()) parts.push('', `Note : ${doc.notes.trim()}`)
  parts.push(
    '',
    `Pour toute question, répondez simplement à ce message.`,
    '',
    doc.emetteur.nom,
    ...[doc.emetteur.telephone, doc.emetteur.email].filter(Boolean),
  )
  return parts.join('\n')
}

// --- Validation avant envoi ---------------------------------------------------------------

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/

export const isEmail = (s: string): boolean => EMAIL_RE.test(s.trim())

/** Découpe une saisie libre ("a@b.be, c@d.be") en adresses valides + rejetées. */
export function parseEmails(input: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const raw of input.split(/[,;\s]+/)) {
    const e = raw.trim()
    if (!e) continue
    const key = e.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    ;(isEmail(e) ? valid : invalid).push(e)
  }
  return { valid, invalid }
}

/** Ce qui empêche d'envoyer. Vide = prêt. */
export function problemesEnvoi(doc: DepotDoc, destinataires: string[]): string[] {
  const p: string[] = []
  if (!doc.emetteur.nom.trim()) p.push('Renseigne tes coordonnées dans Compte → Mes coordonnées.')
  if (!doc.boutique_nom.trim()) p.push('Nom de la boutique manquant.')
  if (!doc.lignes.length) p.push('Ajoute au moins un article.')
  if (doc.lignes.some((l) => !l.designation.trim())) p.push('Une ligne est sans désignation.')
  if (doc.lignes.some((l) => !(l.quantite > 0))) p.push('Une quantité est nulle ou négative.')
  if (!doc.signature_image) p.push('La signature manque.')
  if (!destinataires.length) p.push('Aucun destinataire.')
  if (destinataires.some((e) => !isEmail(e))) p.push('Une adresse mail est invalide.')
  return p
}
