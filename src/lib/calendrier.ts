import type { Commande, ContentEntry } from './supabase'

/**
 * Jours qui portent l'échéance d'une commande encore à servir — LES SIENNES (un client, une pièce à
 * produire). Une demande de réassort venue d'une boutique ne marque plus ce jeu-là : elle a sa
 * propre famille depuis le 08/10/2026, pour qu'il voie d'un coup d'œil ce qu'une boutique attend.
 *
 * Une commande archivée ou livrée ne marque plus le calendrier : on y planifie ce qui reste à
 * faire, pas l'historique. La date d'échéance est une colonne `date` (AAAA-MM-JJ), donc
 * directement comparable aux cases du calendrier.
 */
export function joursAvecCommande(commandes: Commande[]): Set<string> {
  const jours = new Set<string>()
  for (const c of commandes) {
    if (c.archived_at || c.statut === 'livree') continue
    if (c.type === 'boutique') continue
    if (c.date_echeance) jours.add(c.date_echeance)
  }
  return jours
}

/**
 * Jours qui portent une DEMANDE DE RÉASSORT d'une boutique encore à servir. Décision de JSB du
 * 08/10/2026 : « pour artisan on met juste réassort tout simplement » — une famille, rien de plus.
 *
 * Ce qu'elle attend en détail (quelle boutique, combien de pièces) vit dans le suivi des boutiques :
 * une case de calendrier ne porte qu'une pastille, elle n'a pas la place d'un dossier.
 */
export function joursAvecReassort(commandes: Commande[]): Set<string> {
  const jours = new Set<string>()
  for (const c of commandes) {
    if (c.archived_at || c.statut === 'livree') continue
    if (c.type !== 'boutique') continue
    if (c.date_echeance) jours.add(c.date_echeance)
  }
  return jours
}

/** Les jours marqués, par famille. */
export type JoursMarques = {
  commandes: Set<string>
  reassort: Set<string>
}

/** Les deux jeux d'un seul appel — ce que l'écran passe au calendrier. */
export function joursMarques(commandes: Commande[]): JoursMarques {
  return { commandes: joursAvecCommande(commandes), reassort: joursAvecReassort(commandes) }
}

/** Les familles de choses qu'un jour peut porter. Une pastille par famille, jamais plus. */
export type Famille = 'contenu' | 'commande' | 'reassort'

export type Pastille = {
  famille: Famille
  /** Creuse = il reste quelque chose à faire ce jour-là. Pleine = tout est fait. */
  creux: boolean
}

/**
 * Pastilles d'une case du calendrier.
 *
 * La couleur dit la NATURE (contenu, commande, réassort), jamais l'avancement : le statut est écrit en
 * toutes lettres dans la liste du jour et filtrable dans la vue Liste. Quatre couleurs de statut
 * dans une grille de sept colonnes ne se lisaient plus — et une information portée par la couleur
 * seule est inaccessible. Reste le seul signal qu'une couleur ne peut pas porter : « il reste
 * quelque chose à faire ici », exprimé par la forme (pastille creuse).
 */
export function pastillesDuJour(entries: ContentEntry[], jours: JoursMarques, date: string): Pastille[] {
  const pastilles: Pastille[] = []
  const duJour = entries.filter((e) => e.date === date)
  if (duJour.length) {
    pastilles.push({ famille: 'contenu', creux: duJour.some((e) => e.status !== 'publie') })
  }
  // Le réassort passe avant les commandes : c'est ce qui vient de l'extérieur, et ce qui se traite
  // le plus vite. L'ordre des pastilles est celui de la légende.
  if (jours.reassort.has(date)) pastilles.push({ famille: 'reassort', creux: false })
  if (jours.commandes.has(date)) pastilles.push({ famille: 'commande', creux: false })
  return pastilles
}
