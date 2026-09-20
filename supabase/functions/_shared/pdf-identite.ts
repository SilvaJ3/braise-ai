// L'identité visuelle Braise sur papier : fond crème quadrillé, monogramme vert, en-tête
// émetteur, filets, pied de page, tableaux à bandeau vert. Extraite du bon de dépôt le jour où le
// relevé facturable est arrivé : deux documents de la même maison ne doivent pas diverger, et
// recopier ces cent lignes dans un deuxième fichier garantissait qu'ils divergent un jour.
//
// Design figé dans design_handoff_bon_depot/ (voir historique) ; seules deux libertés ont été
// prises faute de donnée source : pas de second libellé sous le nom (aucun champ « accroche »
// dans DepotDoc) et un quadrillage de fond simplifié (grille 20pt au lieu de 5×6pt, pour un flux
// PDF raisonnable — cf. note dans papierDeFond()).
import { A4, PdfDoc, loadFont, textWidthFont } from './pdf-lite.ts'
import type { Emetteur } from './depot-doc.ts'
import {
  PUBLIC_SANS_BOLD_B64,
  PUBLIC_SANS_REGULAR_B64,
  PUBLIC_SANS_SEMIBOLD_B64,
  SOURCE_SERIF_BOLD_B64,
  SOURCE_SERIF_ITALIC_B64,
} from './fonts.ts'

export const M = 50 // marge
export const BAS_UTILE = A4.height - 70 // au-delà : pied de page

// --- Couleurs (approximations RGB des tokens oklch du handoff — pdf-lite ne fait que du RGB) ---
export const VERT = [0.18, 0.325, 0.224] as [number, number, number] // #2E5339
export const TEXTE = [0.16, 0.15, 0.14] as [number, number, number] // texte principal, gris très foncé chaud
export const GRIS = [0.42, 0.42, 0.42] as [number, number, number] // texte secondaire / eyebrows
export const TRAIT = [0.82, 0.82, 0.82] as [number, number, number] // filets légers
export const TRAIT_EPAIS = [0.13, 0.13, 0.13] as [number, number, number] // filet du total
export const BANDEAU = [0.92, 0.945, 0.915] as [number, number, number] // en-tête tableau, vert pâle
export const ZEBRE = [0.966, 0.974, 0.96] as [number, number, number] // lignes impaires
export const PAPIER = [0.984, 0.978, 0.968] as [number, number, number] // fond de page, teinte crème
export const GRILLE = [0.958, 0.953, 0.94] as [number, number, number] // quadrillage papier, très discret
export const CADRE = [0.82, 0.82, 0.82] as [number, number, number] // bordure du cadre signature
export const BLANC = [1, 1, 1] as [number, number, number]

/** Un caractère base64 → les octets qu'il porte. `atob` n'existe pas partout, mais sous Deno et
 *  dans un navigateur oui — et le décodeur maison évite d'y penser. */
export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Décodées une fois par isolat : construire les métriques (cmap/hmtx) coûte quelques centaines de
// lookups sur un alphabet WinAnsi de ~220 points de code, négligeable face au reste du rendu.
export const FONT = {
  sans: loadFont(decodeBase64(PUBLIC_SANS_REGULAR_B64), { name: 'PublicSans' }),
  sansSemiBold: loadFont(decodeBase64(PUBLIC_SANS_SEMIBOLD_B64), { name: 'PublicSans-SemiBold' }),
  sansBold: loadFont(decodeBase64(PUBLIC_SANS_BOLD_B64), { name: 'PublicSans-Bold', bold: true }),
  serifBold: loadFont(decodeBase64(SOURCE_SERIF_BOLD_B64), { name: 'SourceSerif4-Bold', bold: true, serif: true }),
  serifItalic: loadFont(decodeBase64(SOURCE_SERIF_ITALIC_B64), { name: 'SourceSerif4-Italic', italic: true, serif: true }),
}

/** Letter-spacing façon CSS `em` → points absolus attendus par `TextOpts.tracking`. */
export const em = (size: number, fraction: number) => size * fraction

/** Quadrillage papier très discret en fond de page. Le CSS de référence répète un motif 5×6pt ;
 *  reproduire ça trait à trait en PDF (≈260 lignes/page) alourdirait inutilement le flux pour un
 *  effet qui doit rester à peine perceptible, donc grille 20pt — même intention, moins d'opérations. */
export function papierDeFond(doc: PdfDoc): void {
  doc.rect(0, 0, A4.width, A4.height, PAPIER)
  const PAS = 20
  for (let x = PAS; x < A4.width; x += PAS) doc.line(x, 0, x, A4.height, 0.4, GRILLE)
  for (let y = PAS; y < A4.height; y += PAS) doc.line(0, y, A4.width, y, 0.4, GRILLE)
}

/** Cercle plein + lettre centrée — monogramme de marque. */
export function monogramme(doc: PdfDoc, cx: number, topCy: number, r: number, lettre: string): void {
  doc.circle(cx, topCy, r, { fill: VERT })
  doc.text(cx, topCy - r * 0.42, lettre, { size: r * 0.94, font: FONT.serifBold, align: 'center', color: BLANC })
}

/** En-tête émetteur. En version « suite » (pages 2+), seuls monogramme réduit + nom sont repris. */
export function enTete(doc: PdfDoc, emetteur: Emetteur, suite: boolean): number {
  const initiale = (emetteur.nom.trim()[0] ?? '?').toUpperCase()
  const r = suite ? 10 : 17
  const cx = M + r
  const cy = 22 + r
  monogramme(doc, cx, cy, r, initiale)
  const nomX = cx + r + (suite ? 9 : 12)
  doc.text(nomX, suite ? 22 : 20, emetteur.nom, { size: suite ? 11 : 15, font: FONT.serifBold, color: TEXTE })

  let y = cy + r + 12
  if (!suite) {
    const coords = [emetteur.adresse, emetteur.telephone, emetteur.tva].filter((l) => l?.trim())
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

export function piedDePage(doc: PdfDoc, emailEmetteur: string | null | undefined, page: number, total: number): void {
  const y = A4.height - 48
  doc.line(M, y, A4.width - M, y, 0.6, TRAIT)
  if (emailEmetteur) doc.text(M, y + 8, emailEmetteur, { size: 8, font: FONT.sans, color: GRIS })
  if (total > 1) doc.text(A4.width - M, y + 8, `${page}/${total}`, { size: 8, font: FONT.sans, align: 'right', color: GRIS })
}

/** Petit libellé "eyebrow" : capitales grises, letter-spacing large. */
export function eyebrow(doc: PdfDoc, x: number, y: number, texte: string): void {
  doc.text(x, y, texte.toUpperCase(), { size: 8.5, font: FONT.sansSemiBold, color: GRIS, tracking: em(8.5, 0.09) })
}

export type ColonneTableau = { label: string; x: number; align?: 'left' | 'right' }

/** Bandeau vert du tableau : chaque colonne porte son ancre horizontale (en texte aligné à gauche
 *  ou à droite de ce point). Les ancres sont données par l'appelant, pour que le libellé et les
 *  valeurs de la colonne tombent exactement au même endroit. */
export function enTeteTableau(doc: PdfDoc, y: number, colonnes: ColonneTableau[]): number {
  const h = 24
  doc.rect(M, y, A4.width - 2 * M, h, BANDEAU)
  const opts = { size: 8, font: FONT.sansBold, color: VERT, tracking: em(8, 0.06) } as const
  for (const c of colonnes) doc.text(c.x, y + 8, c.label, { ...opts, align: c.align ?? 'left' })
  return y + h
}
