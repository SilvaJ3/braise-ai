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
  /**
   /** La quantité du DERNIER dépôt de cette pièce (0061) : c'est elle que la demande de réassort
    * propose, parce que « ce que vous avez reçu la dernière fois » se réécrit d'un cran, alors qu'un
    * chiffre inventé se corrige de zéro. Zéro quand l'artisan ne l'a jamais déposée.
    */
   derniere_quantite: number
   /**
    * La date du dernier dépôt de cette pièce (« AAAA-MM-JJ »), `null` si elle n'a jamais été déposée.
    * `boutique_etat` la rend depuis 0061 : c'est elle qui donne son rythme au planning. Facultative
    * comme toute clé venue d'un `jsonb` : une version antérieure de la fonction ne la rend pas, et
    * l'écran doit tenir quand même.
    */
   dernier_depot?: string | null
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
  // Les refus des deux gestes : confirmer la réception d'un bon, demander un réassort.
  bon_inconnu: "Ce bon n'est pas chez toi : rien n'a été confirmé.",
  aucune_demande: "La demande est vide : rien n'est parti chez l'artisan.",
  aucune_vente: "Rien à déclarer : aucune vente n'est saisie, ou ces pièces ne viennent pas de cet artisan.",
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
      derniere_quantite: n(o.derniere_quantite),
      dernier_depot: o.dernier_depot ? String(o.dernier_depot) : null,
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

/**
 * Une ligne de l'historique de ses ventes : ce que la boutique a déclaré à cet artisan, et ce que
 * l'artisan en a fait. `boutique_historique` ne rend que des TOTAUX (ventes, reprises, montant
 * facturable) et les 12 dernières déclarations — jamais le détail pièce par pièce.
 */
export type ReleveEspace = {
  /** La date de la déclaration (ISO), pour le mois et le jour. */
  declaration: string | null
  ventes: number
  reprises: number
  /** Le montant que la boutique doit à l'artisan pour cette déclaration, en euros. */
  facturable: number
  /** `declaree` (pas encore regardée), `validee`, `corrigee` (écartée) ; `null` si la base ne le dit pas. */
  statut: 'declaree' | 'validee' | 'corrigee' | null
}

/** L'historique rendu par `boutique_compte_historique()`, du plus récent au plus ancien (tel que la base le trie). */
export function lireHistorique(brut: unknown): { releves: ReleveEspace[]; erreur: string | null } {
  const o = (brut ?? {}) as Record<string, unknown>
  if (o.erreur) return { releves: [], erreur: String(o.erreur) }
  const liste = Array.isArray(o.historique) ? o.historique : []
  const releves = liste.map((l): ReleveEspace => {
    const h = (l ?? {}) as Record<string, unknown>
    const s = h.statut
    return {
      declaration: h.declaration ? String(h.declaration) : null,
      ventes: n(h.ventes),
      reprises: n(h.reprises),
      facturable: n(h.facturable),
      statut: s === 'declaree' || s === 'validee' || s === 'corrigee' ? s : null,
    }
  })
  return { releves, erreur: null }
}

/** « septembre 2026 » depuis une date ISO ; « — » si elle est illisible. */
export function moisLisible(v: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(v ?? ''))
  if (!m) return '—'
  const mois = Number(m[2])
  const noms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return mois >= 1 && mois <= 12 ? `${noms[mois - 1]} ${m[1]}` : '—'
}

/**
 * Ce que la boutique lit du sort de chaque déclaration. Un relevé écarté ne compte plus dans le stock :
 * on le dit, la trace reste. Un statut que la base ne donne pas ne s'invente pas (null = rien à dire).
 */
export function texteStatutReleve(s: ReleveEspace['statut']): string | null {
  switch (s) {
    case 'declaree': return "Envoyé à l'artisan, pas encore regardé"
    case 'validee': return "Validé par l'artisan"
    case 'corrigee': return "Écarté par l'artisan : ne compte plus"
    default: return null
  }
}

/**
 * Déclarer ses ventes — la couche pure du geste. Une déclaration est UN envoi : toutes les pièces
 * vendues depuis la dernière fois, en un seul message. La base en fait une ligne datée qui s'AJOUTE
 * (rien n'est écrasé), donc envoyer deux fois compte deux fois : l'écran verrouille après l'envoi.
 */
export type LigneDeclaration = {
  cle: string
  designation: string
  prix: number
  /** Ce qui reste chez la boutique avant cet envoi (déposé + entré − vendu − repris). */
  reste: number
  /** Les pièces vendues depuis la dernière déclaration : ce qu'elle saisit. */
  ventes: number
  /**
   * Les pièces que l'artisan a REPRISES (des invendus) : elles sortent du stock mais ne sont pas
   * facturées (0053). Offert pour un dépôt-vente seulement ; à zéro sinon.
   */
  reprises: number
}

/** Une ligne par pièce que la boutique a en stock chez cet artisan, toutes à zéro vente. */
export function lignesADeclarer(pieces: PieceEspace[]): LigneDeclaration[] {
  return pieces
    .filter((p) => p.cle && p.reste > 0)
    .map((p) => ({ cle: p.cle, designation: p.designation, prix: p.prix, reste: p.reste, ventes: 0, reprises: 0 }))
}

/**
 * Ce qui part à la base : une clé et des nombres ENTIERS de pièces vendues et reprises ; une ligne
 * sans mouvement sort de l'envoi.
 */
export function mouvementsEnvoyes(lignes: LigneDeclaration[]): { cle: string; ventes: number; reprises: number }[] {
  return lignes
    .filter((l) => l.ventes > 0 || l.reprises > 0)
    .map((l) => ({ cle: l.cle, ventes: Math.floor(l.ventes), reprises: Math.floor(l.reprises) }))
}

/**
 * Le total de l'envoi. Le MONTANT dû à l'artisan ne compte que les ventes (prix du dernier dépôt de
 * chaque pièce) : une reprise n'est jamais facturée, sa valeur n'est suivie que pour information.
 */
export function totalDeclare(lignes: LigneDeclaration[]): {
  pieces: number
  montant: number
  reprises: number
  valeurReprises: number
} {
  return lignes.reduce(
    (t, l) => ({
      pieces: t.pieces + Math.floor(l.ventes),
      montant: t.montant + Math.floor(l.ventes) * l.prix,
      reprises: t.reprises + Math.floor(l.reprises),
      valeurReprises: t.valeurReprises + Math.floor(l.reprises) * l.prix,
    }),
    { pieces: 0, montant: 0, reprises: 0, valeurReprises: 0 },
  )
}

/**
 * Les lignes où elle déclare plus de pièces (vendues + reprises) qu'il n'en reste : la base ne refuse
 * pas, elle signale à l'artisan — c'est le même calcul qu'elle.
 */
export function depassements(lignes: LigneDeclaration[]): LigneDeclaration[] {
  return lignes.filter((l) => Math.floor(l.ventes) + Math.floor(l.reprises) > l.reste)
}

/**
 * Cet artisan dépose-t-il en DÉPÔT-VENTE ? Seul ce mode se déclare : les pièces restent à l'artisan, la
 * boutique lui dit ce qu'elle a vendu, et il les reprend s'il le faut. En achat ferme elles appartiennent
 * à la boutique : il n'y a ni vente à déclarer à l'artisan, ni reprise (rendre une pièce est un retour,
 * donc un avoir). Le mode est porté par chaque bon : un seul bon en achat ferme suffit à fermer la porte.
 * Sans bon connu (chargement, aucun dépôt) on ne ferme rien : c'est l'absence de preuve, pas une preuve.
 */
export function estDepotVente(bons: BonEspace[]): boolean {
  return !bons.some((b) => b.mode === 'achat_ferme')
}

/**
 * Ce que la boutique lit du dépôt d'une pièce. Une reprise ne réécrit pas le bon (qui fait foi) : le
 * dépôt reste ce qu'il était, et le NET se calcule — « déposé 10, net 7 après 3 reprises ».
 */
export function phraseDepose(p: Pick<PieceEspace, 'depose' | 'repris'>): string {
  if (!(p.repris > 0)) return `déposé ${quantite(p.depose)}`
  return `déposé ${quantite(p.depose)}, net ${quantite(p.depose - p.repris)} après ${quantite(p.repris)} reprise${p.repris > 1 ? 's' : ''}`
}

/** Ce que la base répond à un envoi accepté : le montant facturable, la valeur reprise et si un écart a été signalé. */
export function lireResultatDeclaration(brut: unknown): { facturable: number; valeurReprises: number; alerte: boolean } {
  const o = (brut ?? {}) as Record<string, unknown>
  return { facturable: n(o.facturable), valeurReprises: n(o.valeur_reprises), alerte: o.alerte === true }
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

/**
 * Une ligne de la demande de réassort, telle que la base l'attend : la clé d'une pièce
 * (`produit:<uuid>` ou `nom:<libellé>`) et la quantité demandée. C'est la même forme que depuis la
 * page du lien — `boutique_commander` n'a qu'une seule implémentation, et le compte la réutilise.
 */
export type LigneReassort = { cle: string; designation: string; quantite: number }

/**
 * Ce que la demande propose en s'ouvrant : les pièces que l'artisan a déjà déposées chez cette
 * boutique, à la quantité de son DERNIER dépôt (0061) — « les quantités sont déjà remplies avec ce
 * que vous avez reçu la dernière fois », puis elle ajuste. Une pièce jamais déposée n'apparaît pas
 * (ses rayons, `catalogue`, restent affichés à part) ; une proposition à zéro non plus, sinon
 * l'écran demanderait de corriger des lignes qui ne veulent rien dire.
 */
export function propositionsReassort(pieces: PieceEspace[]): LigneReassort[] {
  return pieces
    .filter((p) => p.cle !== '' && p.derniere_quantite > 0)
    .map((p) => ({ cle: p.cle, designation: p.designation, quantite: p.derniere_quantite }))
}

/** Ce qui part réellement à la base : les lignes à quantité positive. Un zéro est un retrait, pas une demande. */
export function lignesDemandees(lignes: LigneReassort[]): { cle: string; quantite: number }[] {
  return lignes
    .filter((l) => l.cle !== '' && l.quantite > 0)
    .map((l) => ({ cle: l.cle, quantite: l.quantite }))
}

/** Le total de la demande, en pièces — le chiffre que la boutique relit avant d'envoyer. */
export function totalDemande(lignes: LigneReassort[]): number {
  return Math.round((lignes.reduce((s, l) => s + Math.max(l.quantite, 0), 0) + Number.EPSILON) * 100) / 100
}
