import type { Commande, ContentEntry } from './supabase'

/**
 * Jours qui portent l'échéance d'une commande encore à servir.
 *
 * Une commande archivée ou livrée ne marque plus le calendrier : on y planifie ce qui reste à
 * faire, pas l'historique. La date d'échéance est une colonne `date` (AAAA-MM-JJ), donc
 * directement comparable aux cases du calendrier.
 */
export function joursAvecCommande(commandes: Commande[]): Set<string> {
  const jours = new Set<string>()
  for (const c of commandes) {
    if (c.archived_at || c.statut === 'livree') continue
    if (c.date_echeance) jours.add(c.date_echeance)
  }
  return jours
}

/** Les familles de choses qu'un jour peut porter. Une pastille par famille, jamais plus. */
export type Famille = 'contenu' | 'commande'

export type Pastille = {
  famille: Famille
  /** Creuse = il reste quelque chose à faire ce jour-là. Pleine = tout est fait. */
  creux: boolean
}

/**
 * Pastilles d'une case du calendrier.
 *
 * La couleur dit la NATURE (contenu, commande), jamais l'avancement : le statut est écrit en
 * toutes lettres dans la liste du jour et filtrable dans la vue Liste. Quatre couleurs de statut
 * dans une grille de sept colonnes ne se lisaient plus — et une information portée par la couleur
 * seule est inaccessible. Reste le seul signal qu'une couleur ne peut pas porter : « il reste
 * quelque chose à faire ici », exprimé par la forme (pastille creuse).
 */
export function pastillesDuJour(
  entries: ContentEntry[],
  joursCommandes: Set<string>,
  date: string,
): Pastille[] {
  const pastilles: Pastille[] = []
  const duJour = entries.filter((e) => e.date === date)
  if (duJour.length) {
    pastilles.push({ famille: 'contenu', creux: duJour.some((e) => e.status !== 'publie') })
  }
  if (joursCommandes.has(date)) pastilles.push({ famille: 'commande', creux: false })
  return pastilles
}
