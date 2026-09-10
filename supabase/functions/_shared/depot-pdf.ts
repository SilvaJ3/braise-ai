// Rendu du bon de dépôt en PDF — identité visuelle Braise : monogramme + nom en serif, titre avec
// trait d'accent vert, tableau à bandeau/lignes zébrées teintés vert, cadre signature arrondi.
// Design figé dans design_handoff_bon_depot/ (voir historique) ; seules deux libertés ont été
// prises faute de donnée source : pas de second libellé sous le nom (aucun champ « accroche » dans
// DepotDoc) et un quadrillage de fond simplifié (grille 20pt au lieu de 5×6pt, pour un flux PDF
// raisonnable — cf. note dans papierDeFond()).
import {
  fmtDateCourte,
  fmtEuro,
  fmtQte,
  totalDoc,
  totalLigne,
  type DepotDoc,
} from './depot-doc.ts'
import {
  PUBLIC_SANS_BOLD_B64,
  PUBLIC_SANS_REGULAR_B64,
  PUBLIC_SANS_SEMIBOLD_B64,
  SOURCE_SERIF_BOLD_B64,
  SOURCE_SERIF_ITALIC_B64,
} from './fonts.ts'
import { A4, PdfDoc, ellipsizeFont, loadFont, textWidthFont, wrapTextFont } from './pdf-lite.ts'

const M = 50 // marge
const BAS_UTILE = A4.height - 70 // au-delà : pied de page

// --- Couleurs (approximations RGB des tokens oklch du handoff — pdf-lite ne fait que du RGB) ---
const VERT = [0.18, 0.325, 0.224] as [number, number, number] // #2E5339
const TEXTE = [0.16, 0.15, 0.14] as [number, number, number] // texte principal, gris très foncé chaud
const GRIS = [0.42, 0.42, 0.42] as [number, number, number] // texte secondaire / eyebrows
const TRAIT = [0.82, 0.82, 0.82] as [number, number, number] // filets légers
const TRAIT_EPAIS = [0.13, 0.13, 0.13] as [number, number, number] // filet du total
const BANDEAU = [0.92, 0.945, 0.915] as [number, number, number] // en-tête tableau, vert pâle
const ZEBRE = [0.966, 0.974, 0.96] as [number, number, number] // lignes impaires
const PAPIER = [0.984, 0.978, 0.968] as [number, number, number] // fond de page, teinte crème
const GRILLE = [0.958, 0.953, 0.94] as [number, number, number] // quadrillage papier, très discret
const CADRE = [0.82, 0.82, 0.82] as [number, number, number] // bordure du cadre signature
const BLANC = [1, 1, 1] as [number, number, number]

const COL_QTE = 372
const COL_PU = 468
const COL_TOTAL = A4.width - M
const LIGNE_H = 22

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Décodées une fois par isolat : construire les métriques (cmap/hmtx) coûte quelques centaines de
// lookups sur un alphabet WinAnsi de ~220 points de code, négligeable face au reste du rendu.
const FONT = {
  sans: loadFont(decodeBase64(PUBLIC_SANS_REGULAR_B64), { name: 'PublicSans' }),
  sansSemiBold: loadFont(decodeBase64(PUBLIC_SANS_SEMIBOLD_B64), { name: 'PublicSans-SemiBold' }),
  sansBold: loadFont(decodeBase64(PUBLIC_SANS_BOLD_B64), { name: 'PublicSans-Bold', bold: true }),
  serifBold: loadFont(decodeBase64(SOURCE_SERIF_BOLD_B64), { name: 'SourceSerif4-Bold', bold: true, serif: true }),
  serifItalic: loadFont(decodeBase64(SOURCE_SERIF_ITALIC_B64), { name: 'SourceSerif4-Italic', italic: true, serif: true }),
}

/** Letter-spacing façon CSS `em` → points absolus attendus par `TextOpts.tracking`. */
const em = (size: number, fraction: number) => size * fraction

/** Quadrillage papier très discret en fond de page. Le CSS de référence répète un motif 5×6pt ;
 *  reproduire ça trait à trait en PDF (≈260 lignes/page) alourdirait inutilement le flux pour un
 *  effet qui doit rester à peine perceptible, donc grille 20pt — même intention, moins d'opérations. */
function papierDeFond(doc: PdfDoc): void {
  doc.rect(0, 0, A4.width, A4.height, PAPIER)
  const PAS = 20
  for (let x = PAS; x < A4.width; x += PAS) doc.line(x, 0, x, A4.height, 0.4, GRILLE)
  for (let y = PAS; y < A4.height; y += PAS) doc.line(0, y, A4.width, y, 0.4, GRILLE)
}

/** Cercle plein + lettre centrée — monogramme de marque. */
function monogramme(doc: PdfDoc, cx: number, topCy: number, r: number, lettre: string): void {
  doc.circle(cx, topCy, r, { fill: VERT })
  doc.text(cx, topCy - r * 0.42, lettre, { size: r * 0.94, font: FONT.serifBold, align: 'center', color: BLANC })
}

/** En-tête émetteur. En version « suite » (pages 2+), seuls monogramme réduit + nom sont repris. */
function enTete(doc: PdfDoc, d: DepotDoc, suite: boolean): number {
  const initiale = (d.emetteur.nom.trim()[0] ?? '?').toUpperCase()
  const r = suite ? 10 : 17
  const cx = M + r
  const cy = 22 + r
  monogramme(doc, cx, cy, r, initiale)
  const nomX = cx + r + (suite ? 9 : 12)
  doc.text(nomX, suite ? 22 : 20, d.emetteur.nom, { size: suite ? 11 : 15, font: FONT.serifBold, color: TEXTE })

  let y = cy + r + 12
  if (!suite) {
    const coords = [d.emetteur.adresse, d.emetteur.telephone, d.emetteur.tva].filter((l) => l?.trim())
    if (coords.length) {
      let x = M
      for (const l of coords) {
        doc.text(x, y, l, { size: 8.5, font: FONT.sans, color: GRIS })
        x += textWidthFont(l, 8.5, FONT.sans) + 18
      }
      y += 18
    } else {
      y += 4
    }
  }
  doc.line(M, y, A4.width - M, y, suite ? 0.7 : 1, TRAIT)
  return y + (suite ? 18 : 26)
}

function piedDePage(doc: PdfDoc, d: DepotDoc, page: number, total: number): void {
  const y = A4.height - 48
  doc.line(M, y, A4.width - M, y, 0.6, TRAIT)
  if (d.emetteur.email) doc.text(M, y + 8, d.emetteur.email, { size: 8, font: FONT.sans, color: GRIS })
  if (total > 1) doc.text(A4.width - M, y + 8, `${page}/${total}`, { size: 8, font: FONT.sans, align: 'right', color: GRIS })
}

/** Petit libellé "eyebrow" : capitales grises, letter-spacing large. */
function eyebrow(doc: PdfDoc, x: number, y: number, texte: string): void {
  doc.text(x, y, texte.toUpperCase(), { size: 8.5, font: FONT.sansSemiBold, color: GRIS, tracking: em(8.5, 0.09) })
}

function enTeteTableau(doc: PdfDoc, y: number): number {
  const h = 24
  doc.rect(M, y, A4.width - 2 * M, h, BANDEAU)
  const opts = { size: 8, font: FONT.sansBold, color: VERT, tracking: em(8, 0.06) } as const
  doc.text(M + 8, y + 8, 'ARTICLES', opts)
  doc.text(COL_QTE, y + 8, 'QTÉ', { ...opts, align: 'right' })
  doc.text(COL_PU, y + 8, 'PRIX DE VENTE TTC', { ...opts, align: 'right' })
  doc.text(COL_TOTAL - 8, y + 8, 'TOTAL', { ...opts, align: 'right' })
  return y + h
}

/** Cadre signature arrondi : mention légale (italique serif) + nom/date + zone de signature.
 *  Hauteur calculée d'après le contenu, puis dessinée avant le texte pour ne rien recouvrir. */
function blocSignature(doc: PdfDoc, d: DepotDoc, top: number): number {
  const PAD = 18
  const boxX = M
  const boxW = A4.width - 2 * M
  const innerW = boxW - 2 * PAD
  const leading = 8.5 * 1.5
  const lignesMention = wrapTextFont(d.emetteur.mention_signature, innerW, 8.5, FONT.serifItalic)

  const yMention = top + PAD
  const yNomDate = yMention + lignesMention.length * leading + 16
  const ySigLabel = yNomDate + 16
  const ySigZone = ySigLabel + 16
  const boxH = ySigZone + 40 + PAD - top

  doc.roundedRect(boxX, top, boxW, boxH, 3, { stroke: CADRE, strokeWidth: 0.75 })
  lignesMention.forEach((l, i) =>
    doc.text(boxX + PAD, yMention + i * leading, l, { size: 8.5, font: FONT.serifItalic, color: GRIS }),
  )
  doc.text(boxX + PAD, yNomDate, 'NOM :', { size: 9, font: FONT.sansBold, color: TEXTE })
  if (d.signataire_nom) doc.text(boxX + PAD + 32, yNomDate, d.signataire_nom, { size: 9, font: FONT.sans, color: TEXTE })
  doc.text(boxX + PAD + 200, yNomDate, 'DATE :', { size: 9, font: FONT.sansBold, color: TEXTE })
  doc.text(boxX + PAD + 235, yNomDate, fmtDateCourte(d.date_depot), { size: 9, font: FONT.sans, color: TEXTE })

  doc.text(boxX + PAD, ySigLabel, 'SIGNATURE :', { size: 9, font: FONT.sansBold, color: TEXTE })
  if (d.signature_image) {
    try {
      doc.jpeg(decodeBase64(d.signature_image), boxX + PAD, ySigZone, 200, 40)
      return boxH
    } catch {
      // Signature illisible : on retombe sur un trait vide plutôt que d'échouer.
    }
  }
  doc.line(boxX + PAD, ySigZone + 32, boxX + PAD + 200, ySigZone + 32, 0.6, CADRE)
  return boxH
}

/** Photo de l'état des articles au dépôt : cadre arrondi, image contenue dedans. Hauteur fixe
 *  (200pt) pour que la pagination reste prévisible, quel que soit le ratio de la photo. */
const PHOTO_H = 200

function blocPhoto(doc: PdfDoc, d: DepotDoc, top: number): number {
  if (!d.photo_image) return 0
  const PAD = 10
  const boxW = A4.width - 2 * M
  doc.text(M, top, 'Photo du dépôt', { size: 9, font: FONT.sansBold, color: TEXTE })
  const boxTop = top + 14
  const boxH = PHOTO_H + 2 * PAD
  doc.roundedRect(M, boxTop, boxW, boxH, 3, { stroke: CADRE, strokeWidth: 0.75 })
  try {
    doc.jpeg(decodeBase64(d.photo_image), M + PAD, boxTop + PAD, boxW - 2 * PAD, PHOTO_H)
  } catch {
    // Photo illisible : le cadre vide reste affiché plutôt que d'échouer tout le document.
  }
  return boxH + 14
}

export function renderDepotPdf(d: DepotDoc): Uint8Array {
  const doc = new PdfDoc()
  papierDeFond(doc)
  let y = enTete(doc, d, false)

  doc.text(M, y, 'Bon de dépôt', { size: 24, font: FONT.serifBold, color: TEXTE })
  y += 30
  doc.rect(M, y, 38, 2.5, VERT)
  y += 22

  // Deux colonnes d'identification.
  const colD = 330
  eyebrow(doc, M, y, 'Point de vente')
  eyebrow(doc, colD, y, 'Détail du dépôt')
  let yg = y + 18
  let yd = y + 18

  const champ = (x: number, yy: number, label: string, valeur: string, largeur: number): number => {
    doc.text(x, yy, label, { size: 9, font: FONT.sansBold, color: TEXTE })
    const dx = textWidthFont(label, 9, FONT.sansBold) + 5
    const lignes = wrapTextFont(valeur || '—', largeur - dx, 9, FONT.sans)
    lignes.forEach((l, i) => doc.text(x + dx, yy + i * 13, l, { size: 9, font: FONT.sans, color: TEXTE }))
    return yy + Math.max(1, lignes.length) * 13 + 4
  }

  yg = champ(M, yg, 'Nom :', d.boutique_nom, colD - M - 20)
  yg = champ(M, yg, 'Adresse :', d.boutique_adresse ?? '', colD - M - 20)
  yg = champ(M, yg, 'Email :', d.boutique_email ?? '', colD - M - 20)
  yd = champ(colD, yd, 'Date de dépôt :', fmtDateCourte(d.date_depot), A4.width - M - colD)
  if (d.numero) yd = champ(colD, yd, 'N° :', d.numero, A4.width - M - colD)

  y = Math.max(yg, yd) + 16
  y = enTeteTableau(doc, y)

  d.lignes.forEach((l, i) => {
    if (y + LIGNE_H > BAS_UTILE) {
      doc.addPage()
      papierDeFond(doc)
      y = enTeteTableau(doc, enTete(doc, d, true))
    }
    if (i % 2 === 1) doc.rect(M, y, A4.width - 2 * M, LIGNE_H, ZEBRE)
    doc.text(M + 8, y + 7, ellipsizeFont(l.designation, COL_QTE - M - 30, 9.5, FONT.sans), { size: 9.5, font: FONT.sans, color: TEXTE })
    doc.text(COL_QTE, y + 7, fmtQte(l.quantite), { size: 9.5, font: FONT.sans, align: 'right', color: TEXTE })
    doc.text(COL_PU, y + 7, fmtEuro(l.prix_unitaire), { size: 9.5, font: FONT.sans, align: 'right', color: TEXTE })
    doc.text(COL_TOTAL - 8, y + 7, fmtEuro(totalLigne(l)), { size: 9.5, font: FONT.sans, align: 'right', color: TEXTE })
    y += LIGNE_H
    doc.line(M, y, A4.width - M, y, 0.4, TRAIT)
  })

  // Total général
  doc.line(M, y, A4.width - M, y, 1.2, TRAIT_EPAIS)
  y += 10
  doc.text(COL_PU, y, 'TOTAL', { size: 11, font: FONT.sansBold, align: 'right', color: TEXTE, tracking: em(11, 0.06) })
  doc.text(COL_TOTAL - 8, y, fmtEuro(totalDoc(d.lignes)), { size: 11, font: FONT.sansBold, align: 'right', color: VERT })
  y += 30

  if (d.notes?.trim()) {
    doc.text(M, y, 'Note :', { size: 9, font: FONT.sansBold, color: TEXTE })
    y += 14
    y += doc.paragraph(M, y, d.notes.trim(), A4.width - 2 * M, { size: 9, font: FONT.sans, color: TEXTE })
    y += 12
  }

  // Photo et signature ne doivent jamais être coupées : ~155 pt pour la signature (mention sur
  // 2 lignes), + la hauteur fixe du cadre photo si une photo a été prise.
  const hPhoto = d.photo_image ? PHOTO_H + 2 * 10 + 14 : 0
  if (y + hPhoto + 155 > BAS_UTILE) {
    doc.addPage()
    papierDeFond(doc)
    y = enTete(doc, d, true) + 10
  }
  y += blocPhoto(doc, d, y)
  blocSignature(doc, d, y)

  // Pieds de page en dernier : le nombre total de pages n'est connu qu'ici.
  const total = doc.pageCount
  for (let i = 0; i < total; i++) {
    doc.setPage(i)
    piedDePage(doc, d, i + 1, total)
  }
  return doc.save()
}
