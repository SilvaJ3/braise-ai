// Rendu du relevé facturable en PDF — même identité visuelle que le bon de dépôt (fond crème
// quadrillé, monogramme vert, tableau à bandeau vert), parce que les deux documents partent de la
// même maison vers la même boutique.
//
// Deux tableaux, jamais mélangés : ce qui est facturé (les ventes) et ce qui ne l'est pas (les
// reprises), puis le montant. C'est la règle du produit mise en page — une reprise comptée comme
// une vente, c'est la boutique qui paie ce qu'elle n'a pas vendu.
import { fmtDateCourte, fmtEuro, fmtQte, MODE_LABEL } from './depot-doc.ts'
import {
  BANDEAU,
  BAS_UTILE,
  FONT,
  GRIS,
  M,
  TEXTE,
  TRAIT,
  TRAIT_EPAIS,
  VERT,
  ZEBRE,
  em,
  enTete,
  enTeteTableau,
  eyebrow,
  papierDeFond,
  piedDePage,
  type ColonneTableau,
} from './pdf-identite.ts'
import { A4, PdfDoc, ellipsizeFont, textWidthFont, wrapTextFont } from './pdf-lite.ts'
import {
  LIBELLE_TOTAL,
  MENTION_RELEVE,
  TITRE_RELEVE,
  couvertureReleve,
  libellePeriode,
  montantReleve,
  type ReleveDoc,
} from './releve-doc.ts'

const COL_QTE = 372
const COL_PU = 468
const COL_TOTAL = A4.width - M
const LIGNE_H = 22

const COLONNES_RELEVE: ColonneTableau[] = [
  { label: 'ARTICLES VENDUS', x: M + 8 },
  { label: 'QTÉ VENDUES', x: COL_QTE, align: 'right' },
  { label: 'PRIX DE VENTE TTC', x: COL_PU, align: 'right' },
  { label: 'TOTAL', x: COL_TOTAL - 8, align: 'right' },
]

/** En-tête d'identification, deux colonnes : le point de vente à gauche, le relevé à droite. */
function identification(pdf: PdfDoc, doc: ReleveDoc, y: number): number {
  const colD = 330
  const largeurG = colD - M - 20
  const largeurD = A4.width - M - colD

  eyebrow(pdf, M, y, 'Point de vente')
  eyebrow(pdf, colD, y, 'Le relevé')
  let yg = y + 18
  let yd = y + 18

  const champ = (x: number, yy: number, label: string, valeur: string, largeur: number): number => {
    pdf.text(x, yy, label, { size: 9, font: FONT.sansBold, color: TEXTE })
    const dx = textWidthFont(label, 9, FONT.sansBold) + 5
    const lignes = wrapTextFont(valeur || '—', largeur - dx, 9, FONT.sans)
    lignes.forEach((l, i) => pdf.text(x + dx, yy + i * 13, l, { size: 9, font: FONT.sans, color: TEXTE }))
    return yy + Math.max(1, lignes.length) * 13 + 4
  }

  yg = champ(M, yg, 'Nom :', doc.boutique_nom, largeurG)
  yg = champ(M, yg, 'Adresse :', doc.boutique_adresse ?? '', largeurG)
  yg = champ(M, yg, 'Email :', doc.boutique_email ?? '', largeurG)

  yd = champ(colD, yd, 'N° :', doc.numero ?? 'aperçu — pas encore émis', largeurD)
  if (doc.emis_le) yd = champ(colD, yd, 'Établi le :', fmtDateCourte(doc.emis_le.slice(0, 10)), largeurD)
  yd = champ(colD, yd, 'Période :', `${libellePeriode(doc)} · ${couvertureReleve(doc)}`, largeurD)

  return Math.max(yg, yd) + 16
}

export function renderRelevePdf(doc: ReleveDoc): Uint8Array {
  const pdf = new PdfDoc()
  papierDeFond(pdf)
  let y = enTete(pdf, doc.emetteur, false)

  pdf.text(M, y, TITRE_RELEVE, { size: 24, font: FONT.serifBold, color: TEXTE })
  y += 30
  pdf.rect(M, y, 38, 2.5, VERT)
  y += 22

  // Le montant avant le détail, comme sur le bon : c'est la seule ligne que beaucoup liront.
  const total = montantReleve(doc.lignes)
  const piecesVendues = doc.lignes.reduce((s, l) => s + Number(l.ventes || 0), 0)
  const hResume = 28
  pdf.rect(M, y, A4.width - 2 * M, hResume, BANDEAU)
  pdf.rect(M, y, 3, hResume, VERT)
  pdf.text(M + 14, y + 18, `${fmtQte(piecesVendues)} pièce${piecesVendues > 1 ? 's' : ''} vendue${piecesVendues > 1 ? 's' : ''}`, {
    size: 10.5,
    font: FONT.sansBold,
    color: TEXTE,
  })
  pdf.text(A4.width - M - 14, y + 18, `${LIBELLE_TOTAL} : ${fmtEuro(total)}`, {
    size: 10.5,
    font: FONT.sansBold,
    align: 'right',
    color: VERT,
  })
  y += hResume + 20

  y = identification(pdf, doc, y)
  y = enTeteTableau(pdf, y, COLONNES_RELEVE)

  const ventes = doc.lignes.filter((l) => Number(l.ventes) > 0)
  ventes.forEach((l, i) => {
    if (y + LIGNE_H > BAS_UTILE) {
      pdf.addPage()
      papierDeFond(pdf)
      y = enTeteTableau(pdf, enTete(pdf, doc.emetteur, true), COLONNES_RELEVE)
    }
    if (i % 2 === 1) pdf.rect(M, y, A4.width - 2 * M, LIGNE_H, ZEBRE)
    pdf.text(M + 8, y + 7, ellipsizeFont(l.designation, COL_QTE - M - 30, 9.5, FONT.sans), { size: 9.5, font: FONT.sans, color: TEXTE })
    pdf.text(COL_QTE, y + 7, fmtQte(l.ventes), { size: 9.5, font: FONT.sans, align: 'right', color: TEXTE })
    pdf.text(COL_PU, y + 7, fmtEuro(l.prix_unitaire), { size: 9.5, font: FONT.sans, align: 'right', color: TEXTE })
    pdf.text(COL_TOTAL - 8, y + 7, fmtEuro(l.montant), { size: 9.5, font: FONT.sans, align: 'right', color: TEXTE })
    y += LIGNE_H
    pdf.line(M, y, A4.width - M, y, 0.4, TRAIT)
  })

  pdf.line(M, y, A4.width - M, y, 1.2, TRAIT_EPAIS)
  y += 10
  pdf.text(COL_PU, y, LIBELLE_TOTAL, { size: 11, font: FONT.sansBold, align: 'right', color: TEXTE, tracking: em(11, 0.06) })
  pdf.text(COL_TOTAL - 8, y, fmtEuro(total), { size: 11, font: FONT.sansBold, align: 'right', color: VERT })
  y += 30

  // Les reprises, dites à part : elles ne sont pas facturées, et le document doit le montrer plutôt
  // que de laisser croire qu'on les a oubliées.
  const reprises = doc.lignes.filter((l) => Number(l.reprises) > 0)
  if (reprises.length) {
    if (y + 24 + reprises.length * 16 + 40 > BAS_UTILE) {
      pdf.addPage()
      papierDeFond(pdf)
      y = enTete(pdf, doc.emetteur, true) + 10
    }
    eyebrow(pdf, M, y, 'Reprises — non facturées')
    y += 18
    for (const l of reprises) {
      pdf.text(M, y, `${l.designation} — ${fmtQte(l.reprises)} × ${fmtEuro(l.prix_unitaire)}`, {
        size: 9.5,
        font: FONT.sans,
        color: TEXTE,
      })
      pdf.text(COL_TOTAL - 8, y, fmtEuro(Number(l.reprises) * Number(l.prix_unitaire)), {
        size: 9.5,
        font: FONT.sans,
        align: 'right',
        color: GRIS,
      })
      y += 16
    }
    pdf.text(M, y + 2, `${fmtQte(doc.nb_reprises)} pièce${doc.nb_reprises > 1 ? 's' : ''} reprise${doc.nb_reprises > 1 ? 's' : ''} — ${fmtEuro(doc.valeur_reprises)} de valeur, hors facturation.`, {
      size: 8.5,
      font: FONT.sans,
      color: GRIS,
    })
    y += 24
  }

  y += 6
  y += pdf.paragraph(M, y, MENTION_RELEVE, A4.width - 2 * M, { size: 8.5, font: FONT.serifItalic, color: GRIS, leading: 8.5 * 1.45 })

  // Le mode de vente, rappelé en petit : en achat ferme la boutique a déjà acheté les pièces, et
  // « les ventes déclarées » ne veut pas dire la même chose.
  y += 10
  pdf.text(M, y, `Mode de vente chez elle : ${MODE_LABEL[doc.mode]}`, { size: 8, font: FONT.sans, color: GRIS })

  // Pieds de page en dernier : le nombre total de pages n'est connu qu'ici.
  const totalPages = pdf.pageCount
  for (let i = 0; i < totalPages; i++) {
    pdf.setPage(i)
    piedDePage(pdf, doc.emetteur.email, i + 1, totalPages)
  }
  return pdf.save()
}
