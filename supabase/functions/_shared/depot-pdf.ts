// Rendu du bon de dépôt en PDF, calqué sur le bon papier d'Alexandra : en-tête émetteur,
// bloc « information point de vente » / « détail du dépôt », tableau articles / qté / prix,
// renvoi aux conditions générales du contrat, date et signature manuscrite.
import {
  fmtDateCourte,
  fmtEuro,
  fmtQte,
  totalDoc,
  totalLigne,
  type DepotDoc,
} from './depot-doc.ts'
import { A4, PdfDoc, ellipsize, textWidth, wrapText } from './pdf-lite.ts'

const M = 50 // marge
const GRIS = [0.42, 0.42, 0.42] as [number, number, number]
const TRAIT = [0.82, 0.82, 0.82] as [number, number, number]
const BANDEAU = [0.93, 0.93, 0.93] as [number, number, number]

const COL_QTE = 372
const COL_PU = 468
const COL_TOTAL = A4.width - M
const LIGNE_H = 19
const BAS_UTILE = A4.height - 70 // au-delà : pied de page

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** En-tête émetteur. En version « suite » (pages 2+), seul le nom est repris. */
function enTete(doc: PdfDoc, d: DepotDoc, suite: boolean): number {
  const cx = A4.width / 2
  doc.text(cx, 38, d.emetteur.nom, { size: suite ? 11 : 14, bold: true, align: 'center' })
  let y = 58
  if (!suite) {
    for (const l of [d.emetteur.adresse, d.emetteur.telephone, d.emetteur.tva]) {
      if (!l?.trim()) continue
      doc.text(cx, y, l, { size: 8.5, align: 'center', color: GRIS })
      y += 12
    }
    y += 8
  } else {
    y = 60
  }
  doc.line(M, y, A4.width - M, y, 0.7, TRAIT)
  return y + (suite ? 18 : 26)
}

function piedDePage(doc: PdfDoc, d: DepotDoc, page: number, total: number): void {
  const y = A4.height - 48
  doc.line(M, y, A4.width - M, y, 0.5, TRAIT)
  if (d.emetteur.email) doc.text(A4.width / 2, y + 8, d.emetteur.email, { size: 8, align: 'center', color: GRIS })
  if (total > 1) doc.text(A4.width - M, y + 8, `${page}/${total}`, { size: 8, align: 'right', color: GRIS })
}

function enTeteTableau(doc: PdfDoc, y: number): number {
  doc.rect(M, y, A4.width - 2 * M, 22, BANDEAU)
  doc.text(M + 8, y + 6, 'ARTICLES', { size: 8.5, bold: true })
  doc.text(COL_QTE, y + 6, 'QTÉ', { size: 8.5, bold: true, align: 'right' })
  doc.text(COL_PU, y + 6, 'PRIX DE VENTE TTC', { size: 8.5, bold: true, align: 'right' })
  doc.text(COL_TOTAL - 8, y + 6, 'TOTAL', { size: 8.5, bold: true, align: 'right' })
  return y + 22
}

function blocSignature(doc: PdfDoc, d: DepotDoc, y: number): void {
  doc.paragraph(M, y, d.emetteur.mention_signature, A4.width - 2 * M, { size: 8.5, bold: true })
  let ligne = y + 26
  const label = (t: string, v: string) => {
    doc.text(M, ligne, t, { size: 9, bold: true })
    if (v) doc.text(M + 75, ligne, v, { size: 9 })
    ligne += 16
  }
  label('NOM :', d.signataire_nom ?? '')
  label('DATE :', fmtDateCourte(d.date_depot))
  doc.text(M, ligne, 'SIGNATURE :', { size: 9, bold: true })

  // Le tracé est posé sous la ligne de label pour ne jamais recouvrir la date.
  const sigTop = ligne + 6
  if (d.signature_image) {
    try {
      doc.jpeg(decodeBase64(d.signature_image), M + 75, sigTop, 200, 55)
      return
    } catch {
      // Signature illisible : on retombe sur un trait vide plutôt que d'échouer.
    }
  }
  doc.line(M + 75, sigTop + 40, M + 275, sigTop + 40, 0.6, TRAIT)
}

export function renderDepotPdf(d: DepotDoc): Uint8Array {
  const doc = new PdfDoc()
  let y = enTete(doc, d, false)

  doc.text(M, y, 'Bon de dépôt', { size: 19, bold: true })
  y += 32

  // Deux colonnes d'identification.
  const colD = 330
  doc.text(M, y, 'INFORMATION POINT DE VENTE', { size: 8.5, bold: true, color: GRIS })
  doc.text(colD, y, 'DÉTAIL DU DÉPÔT', { size: 8.5, bold: true, color: GRIS })
  let yg = y + 18
  let yd = y + 18

  const champ = (x: number, yy: number, label: string, valeur: string, largeur: number): number => {
    doc.text(x, yy, label, { size: 9, bold: true })
    const dx = textWidth(label, 9, true) + 5
    const lignes = wrapText(valeur || '—', largeur - dx, 9)
    lignes.forEach((l, i) => doc.text(x + dx, yy + i * 12, l, { size: 9 }))
    return yy + Math.max(1, lignes.length) * 12 + 4
  }

  yg = champ(M, yg, 'Nom :', d.boutique_nom, colD - M - 20)
  yg = champ(M, yg, 'Adresse :', d.boutique_adresse ?? '', colD - M - 20)
  yg = champ(M, yg, 'Email :', d.boutique_email ?? '', colD - M - 20)
  yd = champ(colD, yd, 'Date de dépôt :', fmtDateCourte(d.date_depot), A4.width - M - colD)
  if (d.numero) yd = champ(colD, yd, 'N° :', d.numero, A4.width - M - colD)

  y = Math.max(yg, yd) + 14
  y = enTeteTableau(doc, y)

  for (const l of d.lignes) {
    if (y + LIGNE_H > BAS_UTILE) {
      doc.addPage()
      y = enTeteTableau(doc, enTete(doc, d, true))
    }
    doc.text(M + 8, y + 5, ellipsize(l.designation, COL_QTE - M - 30, 9.5), { size: 9.5 })
    doc.text(COL_QTE, y + 5, fmtQte(l.quantite), { size: 9.5, align: 'right' })
    doc.text(COL_PU, y + 5, fmtEuro(l.prix_unitaire), { size: 9.5, align: 'right' })
    doc.text(COL_TOTAL - 8, y + 5, fmtEuro(totalLigne(l)), { size: 9.5, align: 'right' })
    y += LIGNE_H
    doc.line(M, y, A4.width - M, y, 0.4, TRAIT)
  }

  // Total général
  doc.line(M, y, A4.width - M, y, 0.9)
  doc.text(COL_PU, y + 7, 'TOTAL', { size: 10, bold: true, align: 'right' })
  doc.text(COL_TOTAL - 8, y + 7, fmtEuro(totalDoc(d.lignes)), { size: 10, bold: true, align: 'right' })
  y += 32

  if (d.notes?.trim()) {
    doc.text(M, y, 'Note :', { size: 9, bold: true })
    y += 14
    y += doc.paragraph(M, y, d.notes.trim(), A4.width - 2 * M, { size: 9 })
    y += 12
  }

  // Le bloc signature ne doit jamais être coupé : ~135 pt nécessaires.
  if (y + 135 > BAS_UTILE) {
    doc.addPage()
    y = enTete(doc, d, true)
  }
  blocSignature(doc, d, y)

  // Pieds de page en dernier : le nombre total de pages n'est connu qu'ici.
  const total = doc.pageCount
  for (let i = 0; i < total; i++) {
    doc.setPage(i)
    piedDePage(doc, d, i + 1, total)
  }
  return doc.save()
}
