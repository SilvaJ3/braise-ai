// Rendu du bon de dépôt en PDF — identité visuelle Braise : monogramme + nom en serif, titre avec
// trait d'accent vert, tableau à bandeau/lignes zébrées teintés vert, cadre signature arrondi.
// Le fond de page, l'en-tête, le pied et le bandeau viennent de `pdf-identite.ts`, partagés avec le
// relevé facturable ; ce fichier ne garde que ce qui est propre au bon.
import {
  MODE_MENTION,
  fmtDateCourte,
  fmtEuro,
  fmtQte,
  labelTotal,
  titreBon,
  totalDoc,
  totalLigne,
  type DepotDoc,
} from './depot-doc.ts'
import {
  BANDEAU,
  BAS_UTILE,
  CADRE,
  FONT,
  GRIS,
  M,
  TEXTE,
  TRAIT,
  TRAIT_EPAIS,
  VERT,
  ZEBRE,
  decodeBase64,
  em,
  enTete,
  enTeteTableau,
  eyebrow,
  papierDeFond,
  piedDePage,
} from './pdf-identite.ts'
import { A4, PdfDoc, ellipsizeFont, textWidthFont, wrapTextFont } from './pdf-lite.ts'

const COL_QTE = 372
const COL_PU = 468
const COL_TOTAL = A4.width - M
const LIGNE_H = 22

/** Les quatre colonnes du bon : articles à gauche, chiffres alignés à droite, total au bord. */
const COLONNES_BON = [
  { label: 'ARTICLES', x: M + 8 },
  { label: 'QTÉ', x: COL_QTE, align: 'right' as const },
  { label: 'PRIX DE VENTE TTC', x: COL_PU, align: 'right' as const },
  { label: 'TOTAL', x: COL_TOTAL - 8, align: 'right' as const },
]

/** Cadre signature arrondi : la règle commerciale du mode de vente (sans), la mention légale
 *  (italique serif) + nom/date + zone de signature. Hauteur calculée d'après le contenu, puis
 *  dessinée avant le texte pour ne rien recouvrir. */
function blocSignature(doc: PdfDoc, d: DepotDoc, top: number): number {
  const PAD = 18
  const boxX = M
  const boxW = A4.width - 2 * M
  const innerW = boxW - 2 * PAD
  const leading = 8.5 * 1.5
  const leadingMode = 9 * 1.45
  const lignesMode = wrapTextFont(MODE_MENTION[d.mode], innerW, 9, FONT.sans)
  const lignesMention = wrapTextFont(d.emetteur.mention_signature, innerW, 8.5, FONT.serifItalic)

  const yMode = top + PAD
  const yMention = yMode + lignesMode.length * leadingMode + 10
  const yNomDate = yMention + lignesMention.length * leading + 16
  const ySigLabel = yNomDate + 16
  const ySigZone = ySigLabel + 16
  const boxH = ySigZone + 40 + PAD - top

  doc.roundedRect(boxX, top, boxW, boxH, 3, { stroke: CADRE, strokeWidth: 0.75 })
  lignesMode.forEach((l, i) =>
    doc.text(boxX + PAD, yMode + i * leadingMode, l, { size: 9, font: FONT.sans, color: TEXTE }),
  )
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
  doc.text(M, top, d.mode === 'achat_ferme' ? 'Photo de la livraison' : 'Photo du dépôt', { size: 9, font: FONT.sansBold, color: TEXTE })
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
  let y = enTete(doc, d.emetteur, false)

  doc.text(M, y, titreBon(d.mode), { size: 24, font: FONT.serifBold, color: TEXTE })
  y += 30
  doc.rect(M, y, 38, 2.5, VERT)
  y += 22

  // Le résumé avant le détail, comme sur une facture de fournisseur : le nombre de pièces et le
  // montant se lisent au premier regard, et le tableau ligne par ligne reste juste en dessous —
  // rien n'est perdu, mais personne n'est obligé de faire le total de tête pour savoir où il en est.
  const nbPieces = d.lignes.reduce((s, l) => s + l.quantite, 0)
  const hResume = 28
  doc.rect(M, y, A4.width - 2 * M, hResume, BANDEAU)
  doc.rect(M, y, 3, hResume, VERT)
  doc.text(M + 14, y + 18, `${fmtQte(nbPieces)} pièce${nbPieces > 1 ? 's' : ''}`, {
    size: 10.5, font: FONT.sansBold, color: TEXTE,
  })
  doc.text(A4.width - M - 14, y + 18, `${labelTotal(d.mode)} : ${fmtEuro(totalDoc(d.lignes))}`, {
    size: 10.5, font: FONT.sansBold, align: 'right', color: VERT,
  })
  y += hResume + 20

  // Deux colonnes d'identification.
  const colD = 330
  eyebrow(doc, M, y, 'Point de vente')
  eyebrow(doc, colD, y, d.mode === 'achat_ferme' ? 'Détail de la livraison' : 'Détail du dépôt')
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
  yd = champ(colD, yd, d.mode === 'achat_ferme' ? 'Date de livraison :' : 'Date de dépôt :', fmtDateCourte(d.date_depot), A4.width - M - colD)
  if (d.numero) yd = champ(colD, yd, 'N° :', d.numero, A4.width - M - colD)

  y = Math.max(yg, yd) + 16
  y = enTeteTableau(doc, y, COLONNES_BON)

  d.lignes.forEach((l, i) => {
    if (y + LIGNE_H > BAS_UTILE) {
      doc.addPage()
      papierDeFond(doc)
      y = enTeteTableau(doc, enTete(doc, d.emetteur, true), COLONNES_BON)
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
  doc.text(COL_PU, y, labelTotal(d.mode), { size: 11, font: FONT.sansBold, align: 'right', color: TEXTE, tracking: em(11, 0.06) })
  doc.text(COL_TOTAL - 8, y, fmtEuro(totalDoc(d.lignes)), { size: 11, font: FONT.sansBold, align: 'right', color: VERT })
  y += 30

  if (d.notes?.trim()) {
    doc.text(M, y, 'Note :', { size: 9, font: FONT.sansBold, color: TEXTE })
    y += 14
    y += doc.paragraph(M, y, d.notes.trim(), A4.width - 2 * M, { size: 9, font: FONT.sans, color: TEXTE })
    y += 12
  }

  // Photo et signature ne doivent jamais être coupées : ~170 pt pour la signature (règle du mode
  // de vente sur 2 lignes + mention du contrat), + la hauteur fixe du cadre photo si une photo.
  const hPhoto = d.photo_image ? PHOTO_H + 2 * 10 + 14 : 0
  if (y + hPhoto + 170 > BAS_UTILE) {
    doc.addPage()
    papierDeFond(doc)
    y = enTete(doc, d.emetteur, true) + 10
  }
  y += blocPhoto(doc, d, y)
  blocSignature(doc, d, y)

  // Pieds de page en dernier : le nombre total de pages n'est connu qu'ici.
  const total = doc.pageCount
  for (let i = 0; i < total; i++) {
    doc.setPage(i)
    piedDePage(doc, d.emetteur.email, i + 1, total)
  }
  return doc.save()
}
