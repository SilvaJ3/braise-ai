// Le planning de la boutique — la couche PURE.
//
// Constat du 08/10/2026 : la matière d'un agenda est DÉJÀ dans la base — la date de chaque bon, la
// période du mois en cours, le rythme de chaque artisan (`delai_semaines`), ce qui reste en rayon.
// Ce qui manquait, c'est la vue qui la montre au bon moment. Ce fichier la calcule, sans réseau,
// pour qu'elle se vérifie dans un test (voir `planning-boutique.test.ts`).
//
// Règle de forme : des lignes COURTES, une idée par ligne, la plus urgente en premier, et jamais
// plus de trois à l'écran. Un planning qui liste tout ne se lit pas plus qu'un carnet — l'idée est
// justement qu'elle n'ait plus besoin du carnet.
//
// Ce qui n'est pas ici, faute de données : les réassorts en cours (la table des commandes n'est pas
// exposée à cet écran). Ça viendra quand on saura quoi en dire sans mentir.

import { jour, moisLisible, quantite, type EtatEspace, type FournisseurEspace } from './espace-boutique'

export type LignePlanning = {
  /** Identifiant stable de la ligne (pour les tests et les clés React). */
  cle: string
  icone: string
  texte: string
  /** Ce que la ligne ouvre au clic. */
  vers: string
}

const JOUR_MS = 86_400_000

/** Jours entiers écoulés depuis une date « AAAA-MM-JJ » ; `null` si elle est illisible. */
export function joursDepuis(date: string | null | undefined, maintenant: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''))
  if (!m) return null
  const alors = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const auj = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate())
  return Math.round((auj - alors) / JOUR_MS)
}

/** « aujourd'hui », « hier », « il y a 3 jours ». Jamais « il y a 0 jour ». */
export function depuisQuand(date: string | null | undefined, maintenant: Date): string {
  const j = joursDepuis(date, maintenant)
  if (j === null) return ''
  if (j <= 0) return "aujourd'hui"
  if (j === 1) return 'hier'
  return `il y a ${j} jours`
}

/** « AAAA-MM-JJ » + des semaines → « AAAA-MM-JJ ». `null` si la date est illisible. */
function dansSemaines(date: string | null | undefined, semaines: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''))
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + Math.max(1, semaines) * 7)
  return d.toISOString().slice(0, 10)
}

/** Le dernier dépôt connu d'un artisan chez elle : la pièce la plus récemment déposée. */
export function dernierDepot(f: FournisseurEspace): string | null {
  const dates = f.pieces.map((p) => p.dernier_depot).filter((d): d is string => Boolean(d))
  if (!dates.length) return null
  return dates.reduce((max, d) => (d > max ? d : max))
}

/**
 * « d'octobre » devant une voyelle, « de septembre » devant une consonne — la même élision qu'on
 * écrit partout ailleurs, plutôt qu'un « de octobre » qui fait bâclé.
 */
function deMois(mois: string): string {
  return /^[aeiouyàâäéèêëîïôöûü]/i.test(mois) ? `d’${mois}` : `de ${mois}`
}

/** « Au Coin du Feu », « Au Coin du Feu et Atelier Verveine », « A, B et C » — jamais une liste tronquée en silence. */
function nommer(noms: string[]): string {
  const propres = noms.map((n) => n.trim()).filter(Boolean)
  if (!propres.length) return 'un artisan'
  if (propres.length === 1) return propres[0]
  return `${propres.slice(0, -1).join(', ')} et ${propres[propres.length - 1]}`
}

/**
 * « N bons attendent ta confirmation » — la ligne la plus urgente : la base ne compte pas un bon
 * signé à l'atelier tant que la boutique ne l'a pas confirmé, donc c'est elle qui bloque son propre
 * stock. Les deux plus anciens sont nommés, avec leur âge.
 */
export function ligneConfirmations(etat: EtatEspace, maintenant: Date): LignePlanning | null {
  const enAttente = etat.fournisseurs
    .flatMap((f) => f.a_confirmer.map((b) => ({ f, bon: b })))
    .sort((a, b) => String(a.bon.date).localeCompare(String(b.bon.date)))
  if (!enAttente.length) return null

  const noms = enAttente.slice(0, 2).map(({ f, bon }) => `${f.artisan || 'un artisan'} (${depuisQuand(bon.date, maintenant)})`)
  const texte =
    enAttente.length === 1
      ? `${noms[0]} : 1 bon à confirmer`
      : `${enAttente.length} bons à confirmer — ${nommer(noms)}`
  return {
    cle: 'confirmer',
    icone: '🟠',
    texte,
    vers: `/espace-boutique/fournisseur/${enAttente[0].f.partenaire_id}`,
  }
}

/**
 * Le rituel du mois : qui n'a pas encore déclaré. C'est ce que le cron relance le 5 — ici, elle le
 * voit sans attendre le mail, et la ligne disparaît quand tout est déclaré.
 */
export function ligneDuMois(etat: EtatEspace, maintenant: Date): LignePlanning | null {
  if (!etat.fournisseurs.length) return null
  const mois = moisLisible(etat.periode || maintenant.toISOString().slice(0, 10)).replace(/\s+\d{4}$/, '')
  const reste = etat.fournisseurs.filter((f) => !f.deja_declare)
  if (!reste.length) {
    return { cle: 'mois', icone: '✅', texte: `Relevé ${deMois(mois)} : tout est déclaré`, vers: '/espace-boutique' }
  }
  const noms = nommer(reste.map((f) => f.artisan))
  return {
    cle: 'mois',
    icone: '🗓️',
    texte:
      reste.length === 1
        ? `Relevé ${deMois(mois)} : ${noms} attend ton relevé`
        : `Relevé ${deMois(mois)} : ${reste.length} artisans attendent ton relevé`,
    vers: `/espace-boutique/fournisseur/${reste[0].partenaire_id}/declarer`,
  }
}

/** « 3 pièces presque épuisées » : ce qu'elle a reçu, qu'elle a vendu, et qui n'est plus qu'en fin de rayon. */
export function ligneReassort(etat: EtatEspace): LignePlanning | null {
  const parArtisan = etat.fournisseurs
    .map((f) => ({
      f,
      presque: f.pieces.filter((p) => p.depose > 0 && p.reste <= 1),
    }))
    .filter((x) => x.presque.length > 0)
  if (!parArtisan.length) return null
  const total = parArtisan.reduce((s, x) => s + x.presque.length, 0)
  return {
    cle: 'reassort',
    icone: '📦',
    texte:
      total === 1
        ? `1 pièce presque épuisée chez ${parArtisan[0].f.artisan || 'un artisan'} — pense au réassort`
        : `${quantite(total)} pièces presque épuisées — pense au réassort`,
    vers: `/espace-boutique/fournisseur/${parArtisan[0].f.partenaire_id}`,
  }
}

/**
 * Le prochain dépôt attendu : le dernier dépôt connu plus le délai de l'artisan. Une indication,
 * pas une promesse — d'où « vers le ». On ne garde que la plus proche, et seulement si elle tombe
 * dans les trois semaines : au-delà, ça n'aide personne cette semaine.
 */
export function ligneProchainDepot(etat: EtatEspace, maintenant: Date): LignePlanning | null {
  const prochains = etat.fournisseurs
    .map((f) => ({ f, quand: dansSemaines(dernierDepot(f), f.delai_semaines) }))
    .filter((x): x is { f: FournisseurEspace; quand: string } => Boolean(x.quand))
    .sort((a, b) => a.quand.localeCompare(b.quand))
  if (!prochains.length) return null
  const premier = prochains[0]
  const jours = joursDepuis(premier.quand, maintenant)
  if (jours !== null && jours > 21) return null
  // `joursDepuis` rend un nombre NÉGATIF pour une date à venir : c'est ce qui décide du mot.
  const prefixe = jours !== null && jours < 0 ? 'vers le' : 'depuis le'
  return {
    cle: 'prochain',
    icone: '📅',
    texte: `Prochain dépôt de ${premier.f.artisan || 'un artisan'} — ${prefixe} ${jour(premier.quand)}`,
    vers: `/espace-boutique/fournisseur/${premier.f.partenaire_id}`,
  }
}

/**
 * Le planning, dans l'ordre où il se lit : ce qui bloque (les confirmations), le rendez-vous du mois,
 * le réassort à prévoir, puis le rythme. L'écran en montre trois.
 */
export function planningDeLaSemaine(etat: EtatEspace, maintenant: Date = new Date()): LignePlanning[] {
  return [
    ligneConfirmations(etat, maintenant),
    ligneDuMois(etat, maintenant),
    ligneReassort(etat),
    ligneProchainDepot(etat, maintenant),
  ].filter((l): l is LignePlanning => l !== null)
}
