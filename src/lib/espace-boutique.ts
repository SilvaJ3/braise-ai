// L'espace de la boutique connectée — la couche PURE (migration 0067).
//
// Elle porte la forme exacte des `jsonb` rendus par les fonctions de la base
// (`mon_compte_boutique`, `boutique_compte_etat`, `boutique_compte_bons`) et les quelques calculs
// d'affichage qui vont avec. Aucun appel réseau ici : les hooks vivent dans
// `lib/compte-boutique.ts`, ce qui rend ce fichier vérifiable sans base
// (voir `espace-boutique.test.ts`).
//
// Ce qu'il ne faut pas perdre de vue en lisant l'écran : **le restant se calcule**, il ne se saisit
// jamais. `boutique_etat` ne compte que les bons que la boutique a CONFIRMÉS (déposé + entré −
// vendu − repris) — un bon signé à l'atelier mais jamais reçu ne peut pas être dans son stock.

export type PieceEspace = {
  cle: string
  produit_id: string | null
  designation: string
  /** Prix unitaire du dernier dépôt de cette pièce. */
  prix: number
  depose: number
  vendu: number
  repris: number
  entre: number
  /** déposé + entré − vendu − repris */
  reste: number
}

export type LigneBon = {
  designation: string
  quantite: number
  prix: number
}

export type BonEspace = {
  bon_id: string
  numero: string | null
  date: string | null
  /** `envoye` ou `signe` — un brouillon n'a jamais quitté l'atelier et n'arrive pas ici. */
  statut: string
  confirme_le: string | null
  mode: string | null
  pieces: number
  valeur: number
  lignes: LigneBon[]
}

export type FournisseurEspace = {
  partenaire_id: string
  artisan: string
  boutique: string | null
  delai_semaines: number
  deja_declare: boolean
  a_confirmer: BonEspace[]
  pieces: PieceEspace[]
}

export type EtatEspace = {
  /** Le nom que la boutique se donne, à défaut son adresse. */
  nom: string
  email: string
  periode: string
  fournisseurs: FournisseurEspace[]
}

/** Les codes d'erreur des fonctions de 0067, en français — jamais un code brut à l'écran. */
export const MESSAGES_ESPACE: Record<string, string> = {
  non_connecte: 'Session expirée — reconnecte-toi.',
  pas_un_compte_boutique: "Ce compte n'est pas un compte de boutique.",
  lien_invalide: "Le lien de ta boutique n'est plus valable. Demande-le à ton artisan.",
  partenaire_inconnu: "Cet artisan n'est plus rattaché à ta boutique.",
}

export function messageEspace(code: string | undefined | null): string {
  if (!code) return MESSAGES_ESPACE.non_connecte
  return MESSAGES_ESPACE[code] ?? `Erreur : ${code}`
}

function n(v: unknown): number {
  const x = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(x) ? x : 0
}

/** Un montant en euros, tel qu'il s'écrit en Belgique : « 35 € », « 12,50 € ». */
export function montant(v: unknown): string {
  const x = Math.round((n(v) + Number.EPSILON) * 100) / 100
  return Number.isInteger(x) ? `${x} €` : `${x.toFixed(2).replace('.', ',')} €`
}

/** Une quantité : « 12 », « 2,5 ». */
export function quantite(v: unknown): string {
  const x = Math.round((n(v) + Number.EPSILON) * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace('.', ',').replace(/,?0+$/, '')
}

/** « 2026-09-15T… » ou « 2026-09-15 » → « 15/09/2026 ». Rien à dire = « — ». */
export function jour(v: string | null | undefined): string {
  if (!v) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v))
  if (!m) return '—'
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** « 2026-09-01 » → « septembre 2026 ». Une période illisible s'affiche telle quelle. */
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

export function periodeLisible(periode: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(periode ?? ''))
  if (!m) return periode ?? ''
  return `${MOIS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

function listePieces(brut: unknown): PieceEspace[] {
  if (!Array.isArray(brut)) return []
  return brut.map((p) => {
    const o = (p ?? {}) as Record<string, unknown>
    const depose = n(o.depose)
    const vendu = n(o.vendu)
    const repris = n(o.repris)
    const entre = n(o.entre)
    return {
      cle: String(o.cle ?? ''),
      produit_id: o.produit_id ? String(o.produit_id) : null,
      designation: String(o.designation ?? ''),
      prix: n(o.prix),
      depose,
      vendu,
      repris,
      entre,
      // La base le rend déjà calculé ; on le recalcule à l'identique pour que l'écran tienne même
      // si une clé manque (une version antérieure de la fonction, par exemple).
      reste: o.reste === undefined ? depose + entre - vendu - repris : n(o.reste),
    }
  })
}

function listeLignes(brut: unknown): LigneBon[] {
  if (!Array.isArray(brut)) return []
  return brut.map((l) => {
    const o = (l ?? {}) as Record<string, unknown>
    return { designation: String(o.designation ?? ''), quantite: n(o.quantite), prix: n(o.prix) }
  })
}

/** Un bon tel que `boutique_compte_bons` le rend. */
export function lireBon(brut: unknown): BonEspace {
  const o = (brut ?? {}) as Record<string, unknown>
  return {
    bon_id: String(o.bon_id ?? ''),
    numero: o.numero ? String(o.numero) : null,
    date: o.date ? String(o.date) : null,
    statut: String(o.statut ?? ''),
    confirme_le: o.confirme_le ? String(o.confirme_le) : null,
    mode: o.mode ? String(o.mode) : null,
    pieces: n(o.pieces),
    valeur: n(o.valeur),
    lignes: listeLignes(o.lignes),
  }
}

/**
 * L'état complet rendu par `boutique_compte_etat()` : `boutique_etat` (email, periode,
 * partenaires) augmenté du nom que la boutique se donne. `null` si la fonction a refusé — le code
 * d'erreur est alors dans `erreur`.
 */
export function lireEtat(brut: unknown): { etat: EtatEspace | null; erreur: string | null } {
  const o = (brut ?? {}) as Record<string, unknown>
  if (o.erreur) return { etat: null, erreur: String(o.erreur) }

  const partenaires = Array.isArray(o.partenaires) ? o.partenaires : []
  const fournisseurs: FournisseurEspace[] = partenaires.map((p) => {
    const q = (p ?? {}) as Record<string, unknown>
    return {
      partenaire_id: String(q.partenaire_id ?? ''),
      artisan: String(q.artisan ?? ''),
      boutique: q.boutique ? String(q.boutique) : null,
      delai_semaines: n(q.delai_semaines) || 2,
      deja_declare: q.deja_declare === true,
      a_confirmer: Array.isArray(q.a_confirmer) ? q.a_confirmer.map(lireBon) : [],
      pieces: listePieces(q.pieces),
    }
  })

  return {
    etat: {
      nom: String(o.nom ?? ''),
      email: String(o.email ?? ''),
      periode: String(o.periode ?? ''),
      fournisseurs,
    },
    erreur: null,
  }
}

/** Les bons rendus par `boutique_compte_bons()`, du plus récent au plus ancien. */
export function lireBons(brut: unknown): { bons: BonEspace[]; erreur: string | null } {
  const o = (brut ?? {}) as Record<string, unknown>
  if (o.erreur) return { bons: [], erreur: String(o.erreur) }
  const bons = Array.isArray(o.bons) ? o.bons.map(lireBon) : []
  return { bons, erreur: null }
}

/** Ce que la boutique a reçu de cet artisan, en une phrase : les zéros ne se disent pas. */
export function resumeFournisseur(bons: BonEspace[], pieces: PieceEspace[]): string {
  const recus = bons.filter((b) => b.confirme_le)
  const aConfirmer = bons.length - recus.length
  const parts: string[] = [
    recus.length === 1 ? '1 dépôt reçu' : `${recus.length} dépôts reçus`,
  ]
  if (aConfirmer > 0) parts.push(aConfirmer === 1 ? '1 à confirmer' : `${aConfirmer} à confirmer`)
  const possede = pieces.reduce((s, p) => s + p.depose, 0)
  const vendu = pieces.reduce((s, p) => s + p.vendu, 0)
  const reste = pieces.reduce((s, p) => s + p.reste, 0)
  if (possede > 0) parts.push(`${quantite(possede)} pièces reçues`)
  if (vendu > 0) parts.push(`${quantite(vendu)} vendues`)
  if (reste > 0) parts.push(`${quantite(reste)} restantes`)
  return parts.join(' · ')
}

/** Le nombre de pièces qui restent chez la boutique pour un artisan. */
export function totalRestant(pieces: PieceEspace[]): number {
  return Math.round((pieces.reduce((s, p) => s + p.reste, 0) + Number.EPSILON) * 100) / 100
}

/** Ce qu'un bon est, du point de vue de la boutique : reçu, ou pas encore. */
export function statutBon(b: BonEspace): { texte: string; recu: boolean } {
  return b.confirme_le ? { texte: `Reçu le ${jour(b.confirme_le)}`, recu: true } : { texte: 'À confirmer', recu: false }
}
