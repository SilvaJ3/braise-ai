import type { Commande } from './supabase'

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
