// Ce que l'artisane voit de ses boutiques : la forme exacte du jsonb rendu par
// `mes_boutiques_etat()` (migration 0059, enrichie par 0060) et les quelques calculs d'affichage
// qui vont avec. Aucun appel réseau ici — les hooks vivent dans `lib/boutiques.ts` — ce qui rend
// ce fichier vérifiable sans base (voir boutique-etat.test.ts).
//
// Une règle du modèle qu'il ne faut pas perdre de vue en lisant l'écran : le restant chez la
// boutique se CALCULE, il ne se saisit jamais. Il n'est donc nulle part dans la base, et
// `reste` ici n'est que le résultat du calcul fait côté base (déposé + entré − vendu − repris).

import type { ModeVente } from '../../supabase/functions/_shared/depot-doc'

export type PieceBoutique = {
  cle: string
  produit_id: string | null
  designation: string
  prix: number
  depose: number
  vendu: number
  repris: number
  entre: number
  /** déposé + entré − vendu − repris */
  reste: number
}

export type StatutReleve = 'declaree' | 'validee' | 'corrigee'

export type ReleveBoutique = {
  id: string
  /** Premier jour du mois déclaré, « 2026-09-01 ». */
  periode: string
  statut: StatutReleve
  note: string | null
  declare_le: string
  /** Le montant facturable : la valeur des ventes seules, jamais les reprises. */
  facturable: number
  ventes: number
  reprises: number
  /** Ce qu'elle a compté en plus, reçu sans bon : une correction de stock, pas une vente. */
  entrees: number
  /** Une ligne dépasse ce que l'artisane avait déposé : signalé, pas bloqué. */
  alerte: boolean
}

export type ContestationBoutique = {
  id: string
  bon_id: string
  numero: string | null
  date_depot: string | null
  message: string
  cree_le: string
  /** null = pas encore vue par l'artisane. La trace, elle, ne s'efface pas. */
  vu_le: string | null
}

export type BoutiqueEtat = {
  id: string
  nom: string
  mode: ModeVente
  /** null quand aucun lien n'a jamais été créé pour cette boutique. */
  jeton: string | null
  lien_actif: boolean
  bons_en_attente_de_confirmation: number
  pieces: PieceBoutique[]
  declarations: ReleveBoutique[]
  contestations: ContestationBoutique[]
  contestations_non_vues: number
}

export const STATUT_RELEVE_LABEL: Record<StatutReleve, string> = {
  declaree: 'À valider',
  validee: 'Validé',
  corrigee: 'Écarté',
}

export const STATUT_RELEVE_EXPLICATION: Record<StatutReleve, string> = {
  declaree:
    'La boutique a compté. Ces mouvements comptent dans son stock tant que tu ne les as pas regardés.',
  validee: 'Tu as vérifié ce relevé : il compte.',
  corrigee: 'Relevé écarté : ses mouvements ne comptent plus dans le stock. La trace reste.',
}

export const TEXTE_ECART =
  "Elle a compté plus de pièces qu'il n'en restait d'après les bons : l'écart est signalé, à toi de trancher."

/** Les codes d'erreur rendus par les fonctions de la base (0059, 0060), en français. */
export const MESSAGES_ERREUR: Record<string, string> = {
  non_connecte: 'Session expirée — reconnecte-toi.',
  boutique_inconnue: "Cette boutique n'existe plus.",
  declaration_inconnue: "Ce relevé n'existe plus.",
  statut_inconnu: 'Statut de relevé inconnu.',
  contestation_inconnue: "Ce signalement n'existe plus.",
  lien_invalide: "Ce lien n'est plus valable.",
  bon_inconnu: "Ce bon n'est pas rattaché à cette boutique.",
  message_vide: 'Il manque le message.',
}

export function messageErreur(code: string): string {
  return MESSAGES_ERREUR[code] ?? `Erreur : ${code}`
}

/**
 * L'adresse que la boutique ouvre. Le jeton est la seule authentification, il tient dans l'URL :
 * c'est aussi pour ça qu'il se coupe d'un clic (`couper_lien_boutique`) sans rien perdre des
 * pièces ni de l'historique.
 *
 * `base` n'est là que pour les tests : en vrai, on prend l'origine de la page courante — la
 * préversion Vercel aussi bien que braaise.io.
 */
export function lienBoutiqueUrl(jeton: string, base?: string): string {
  const origine = base ?? (typeof location === 'undefined' ? '' : location.origin)
  return `${origine.replace(/\/+$/, '')}/boutique/?t=${encodeURIComponent(jeton)}`
}

function arrondi(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** Le nombre de pièces qui restent chez elle, toutes références confondues. */
export function totalRestant(pieces: PieceBoutique[]): number {
  return arrondi(pieces.reduce((somme, p) => somme + Number(p.reste || 0), 0))
}

function nb(n: number): string {
  const v = arrondi(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',').replace(/,?0+$/, '')
}

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

/** « 2026-09-01 » → « septembre 2026 ». Une période qu'on ne sait pas lire s'affiche telle quelle. */
export function periodeLisible(periode: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(periode ?? '')
  if (!m) return periode ?? ''
  const mois = MOIS[Number(m[2]) - 1] ?? m[2]
  return `${mois} ${m[1]}`
}

/** Un horodatage ISO → « 19/09/2026 ». Vide, il devient « — » (rien à dire, pas une erreur). */
export function jourDeIso(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** « 3 vendues · 1 reprise · 2 entrées sans bon » — les zéros se taisent, une ligne sans
 *  mouvement le dit plutôt que d'afficher trois zéros. */
export function resumeReleve(r: ReleveBoutique): string {
  const bouts: string[] = []
  if (r.ventes > 0) bouts.push(`${nb(r.ventes)} vendue${r.ventes > 1 ? 's' : ''}`)
  if (r.reprises > 0) bouts.push(`${nb(r.reprises)} reprise${r.reprises > 1 ? 's' : ''}`)
  if (r.entrees > 0) bouts.push(`${nb(r.entrees)} entrée${r.entrees > 1 ? 's' : ''} sans bon`)
  return bouts.length ? bouts.join(' · ') : 'Aucun mouvement'
}

/** Un signalement que l'artisane n'a pas encore ouvert. */
export function estNouveau(c: ContestationBoutique): boolean {
  return c.vu_le === null
}

/**
 * Ce qu'une boutique attend de l'artisane — la matière de la notification dans l'app.
 *
 * Rien n'est stocké pour ça : tout se déduit de ce qui existe déjà (une déclaration au statut
 * `declaree`, un bon jamais confirmé, un message non lu, une demande de réassort en attente). C'est
 * le choix de l'app depuis le début — la cloche compte des faits, elle ne tient pas un journal de
 * notifications. Conséquence assumée : une alerte traitée disparaît d'elle-même, et il n'y a rien
 * à « marquer comme lu ».
 */
export type AlerteBoutique = {
  boutiqueId: string
  boutique: string
  /** `releve` : à valider. `signalement` : un bon contesté. `reassort` : une demande. `bon` : à confirmer. */
  quoi: 'releve' | 'signalement' | 'reassort' | 'bon'
  texte: string
}

export function alertesBoutiques(
  etats: BoutiqueEtat[],
  demandes: { boutique_id: string | null }[] = [],
): AlerteBoutique[] {
  const out: AlerteBoutique[] = []

  for (const e of etats) {
    const aValider = e.declarations.filter((r) => r.statut === 'declaree')
    if (aValider.length) {
      out.push({
        boutiqueId: e.id,
        boutique: e.nom,
        quoi: 'releve',
        texte:
          aValider.length === 1
            ? `Un relevé de ${periodeLisible(aValider[0].periode)} à valider`
            : `${aValider.length} relevés à valider`,
      })
    }
    if (e.contestations_non_vues > 0) {
      out.push({
        boutiqueId: e.id,
        boutique: e.nom,
        quoi: 'signalement',
        texte:
          e.contestations_non_vues === 1
            ? 'Elle a signalé un bon'
            : `${e.contestations_non_vues} bons signalés`,
      })
    }
    if (e.bons_en_attente_de_confirmation > 0) {
      const n = e.bons_en_attente_de_confirmation
      out.push({
        boutiqueId: e.id,
        boutique: e.nom,
        quoi: 'bon',
        texte: `${n} bon${n > 1 ? 's' : ''} en attente de sa confirmation`,
      })
    }
  }

  // Les demandes de réassort vivent dans les commandes (type `boutique`, statut `demande`) : elles
  // arrivent déjà là où elle travaille, et la notification ne fait que le dire plus tôt.
  const parBoutique = new Map<string, number>()
  for (const c of demandes) {
    if (c.boutique_id) parBoutique.set(c.boutique_id, (parBoutique.get(c.boutique_id) ?? 0) + 1)
  }
  for (const [id, nb] of parBoutique) {
    const etat = etats.find((e) => e.id === id)
    if (!etat) continue
    out.push({
      boutiqueId: id,
      boutique: etat.nom,
      quoi: 'reassort',
      texte: nb === 1 ? 'Elle demande un réassort' : `${nb} demandes de réassort`,
    })
  }

  return out
}
