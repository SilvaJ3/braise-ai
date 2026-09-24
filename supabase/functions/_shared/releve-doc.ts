// Modèle du relevé facturable : ce que l'artisan facture à une boutique, et ce qu'elle ne facture
// pas. TypeScript pur — les mêmes phrases et les mêmes totaux servent au PDF (releve-pdf.ts) et à
// l'écran de l'app, qui ne doivent jamais dire deux choses différentes.
//
// La règle du document, en une phrase : la somme des VENTES, les reprises exclues (0053). Une
// reprise est un mouvement de stock, pas une vente ; la compter ferait payer ce qui n'a pas été
// vendu.

import { fmtDateCourte, fmtEuro, fmtQte, type Emetteur, type ModeVente } from './depot-doc.ts'

export type ReleveLigne = {
  cle: string
  produit_id: string | null
  designation: string
  prix_unitaire: number
  /** Ce qui a été vendu, chez elle, pour cette pièce à ce prix-là. */
  ventes: number
  /** Ce que l'artisan a repris : mouvement de stock, hors facturation. */
  reprises: number
  /** ventes × prix — zéro pour une ligne de reprises seules. */
  montant: number
}

export type ReleveDoc = {
  /** null = aperçu : le document n'a pas encore été émis, donc pas encore numéroté. */
  numero: string | null
  /** ISO ; null dans un aperçu. */
  emis_le: string | null
  /** Première et dernière déclaration comptées (AAAA-MM-JJ). */
  periode_debut: string | null
  periode_fin: string | null
  emetteur: Emetteur
  boutique_nom: string
  boutique_adresse: string | null
  boutique_email: string | null
  /** Le mode de vente chez elle : « dépôt-vente » et « achat ferme » ne disent pas la même chose. */
  mode: ModeVente
  lignes: ReleveLigne[]
  total_ventes: number
  nb_pieces: number
  nb_reprises: number
  valeur_reprises: number
  nb_declarations: number
  /** Déclarations comptées que l'artisan n'a pas encore validées — dit à l'écran, pas sur le PDF. */
  a_valider: number
}

export const TITRE_RELEVE = 'Relevé facturable'
export const LIBELLE_TOTAL = 'Montant à facturer'

/** La limite du document, dite noir sur blanc : c'est ce qui empêche qu'on lui reproche un jour
 *  de s'être crue une facture. Ce relevé est la base de la facture, il n'est pas la facture. */
export const MENTION_RELEVE =
  "Ce relevé récapitule les ventes déclarées par la boutique et sert de base à la facture. " +
  "Les reprises n'y sont pas facturées : ce ne sont pas des ventes. Le bon de dépôt signé reste " +
  "la pièce qui fait foi."

const arrondi = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/** « du 18/09/2026 au 20/09/2026 », ou « du 18/09/2026 » si tout tient sur un jour. */
export function libellePeriode(doc: Pick<ReleveDoc, 'periode_debut' | 'periode_fin'>): string {
  const debut = doc.periode_debut
  const fin = doc.periode_fin
  if (!debut && !fin) return '—'
  if (!debut || !fin || debut === fin) return `du ${fmtDateCourte((debut ?? fin) as string)}`
  return `du ${fmtDateCourte(debut)} au ${fmtDateCourte(fin)}`
}

/** Le montant du relevé, recalculé depuis les lignes : le document ne peut pas afficher un total
 *  qui ne soit pas la somme de ce qu'il montre. */
export function montantReleve(lignes: ReleveLigne[]): number {
  return arrondi(lignes.reduce((somme, l) => somme + Number(l.montant || 0), 0))
}

export function valeurReprises(lignes: ReleveLigne[]): number {
  return arrondi(lignes.reduce((somme, l) => somme + Number(l.reprises || 0) * Number(l.prix_unitaire || 0), 0))
}

/** « 3 pièces vendues · 1 reprise (non facturée) » — les zéros se taisent. */
export function resumeVentes(doc: Pick<ReleveDoc, 'nb_pieces' | 'nb_reprises'>): string {
  const bouts: string[] = []
  if (doc.nb_pieces > 0) bouts.push(`${fmtQte(doc.nb_pieces)} pièce${doc.nb_pieces > 1 ? 's' : ''} vendue${doc.nb_pieces > 1 ? 's' : ''}`)
  if (doc.nb_reprises > 0) bouts.push(`${fmtQte(doc.nb_reprises)} reprise${doc.nb_reprises > 1 ? 's' : ''} (non facturée${doc.nb_reprises > 1 ? 's' : ''})`)
  return bouts.length ? bouts.join(' · ') : 'Aucun mouvement'
}

/** « 2 relevés reçus » / « 1 relevé reçu » — ce que le document couvre. */
export function couvertureReleve(doc: Pick<ReleveDoc, 'nb_declarations'>): string {
  const n = doc.nb_declarations
  return n === 1 ? '1 relevé reçu' : `${n} relevés reçus`
}

/** L'adresse du document, imprimée sous la période : ce que le montant a été facturé à. */
export function destinataire(doc: Pick<ReleveDoc, 'boutique_nom' | 'boutique_adresse' | 'boutique_email'>): string {
  return [doc.boutique_nom, doc.boutique_adresse, doc.boutique_email].filter((l) => l?.trim()).join(' · ')
}

/** Ce qu'il reste à faire avant d'émettre, dit sans dramatiser. Vide = rien à signaler. */
export function avertissements(doc: Pick<ReleveDoc, 'lignes' | 'a_valider' | 'total_ventes'>): string[] {
  const out: string[] = []
  if (doc.total_ventes <= 0) out.push("Rien à facturer pour l'instant : aucune vente déclarée depuis le dernier relevé.")
  if (doc.a_valider > 0) {
    out.push(
      doc.a_valider === 1
        ? "Un relevé reçu n'est pas encore validé : ses ventes comptent quand même dans ce montant."
        : `${doc.a_valider} relevés reçus ne sont pas encore validés : leurs ventes comptent quand même dans ce montant.`,
    )
  }
  return out
}

/** Nom du fichier : `releve-REL-2026-001.pdf`, ou `releve-apercu-2026-09-20.pdf` avant émission. */
export function releveFilename(doc: Pick<ReleveDoc, 'numero' | 'periode_fin' | 'emis_le'>): string {
  const brut = doc.numero ?? `apercu-${(doc.emis_le ?? doc.periode_fin ?? '').slice(0, 10)}`
  const base = brut.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return `releve-${base || 'sans-numero'}.pdf`
}

/** Le résumé qu'une notification ou une ligne de journal peut porter. */
export function resumeReleve(doc: Pick<ReleveDoc, 'boutique_nom' | 'total_ventes'>): string {
  return `Relevé ${fmtEuro(doc.total_ventes)} — ${doc.boutique_nom}`
}
