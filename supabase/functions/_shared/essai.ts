// L'essai de sept jours : la règle du produit, écrite une seule fois.
//
// Braaise s'essaie sept jours, puis s'abonne. Ce fichier ne parle à personne et n'importe rien de
// réseau : il dit quand un compte a le droit de travailler, et ce qu'on lit à un artisan dont
// l'essai vient de finir. Le serveur refuse un tour d'assistant ou un import avec cette règle,
// l'écran l'annonce avec la même — deux implémentations divergeraient au premier changement.
//
// Ce que l'essai terminé NE ferme pas : les données. Dépôts, bons, planning, stock, boutiques
// restent lisibles et modifiables. C'est ce qui distingue un essai fini d'un compte perdu, et
// c'est aussi ce qui laisse une raison de revenir.

/** La durée de l'essai, en jours. La seule ligne à changer si la règle change. */
export const ESSAI_JOURS = 7

const MS_JOUR = 86_400_000

/** Ce qui décide de l'accès d'un compte. Tous les champs sont facultatifs : rien n'est deviné. */
export type EtatAcces = {
  /** Fin de l'essai (ISO). Absente = la base ne la connaît pas (voir `accesAutorise`). */
  essai_fin?: string | null
  /** Statut de paiement écrit par `stripe-webhook` : aucun / actif / en_retard / resilie. */
  abonnement_statut?: string | null
  /** Compte de démonstration : aucun conséquence, donc aucune porte. */
  est_test?: boolean | null
}

/** Une date utilisable, ou null : une valeur illisible ne compte pas comme une date. */
function dateFin(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** L'essai court-il encore ? Une date absente ou illisible ne compte pas comme un essai en cours. */
export function essaiEnCours(essaiFin: string | null | undefined, maintenant: Date = new Date()): boolean {
  const fin = dateFin(essaiFin)
  return fin !== null && fin.getTime() > maintenant.getTime()
}

/**
 * Les jours d'essai restants, arrondis au jour supérieur : un essai qui finit dans deux heures
 * affiche « 1 jour », pas « 0 » — le jour en cours n'est pas terminé.
 */
export function joursEssaiRestants(essaiFin: string | null | undefined, maintenant: Date = new Date()): number {
  const fin = dateFin(essaiFin)
  if (!fin) return 0
  const reste = fin.getTime() - maintenant.getTime()
  return reste <= 0 ? 0 : Math.ceil(reste / MS_JOUR)
}

/**
 * Le paiement ouvre l'accès. `en_retard` aussi : un prélèvement qui a échoué est un problème de
 * carte, pas une raison de fermer l'outil à quelqu'un qui travaille (décision du 20/09, tenue ici).
 */
export function abonnementOuvreAcces(statut: unknown): boolean {
  return statut === 'actif' || statut === 'en_retard'
}

/**
 * Le compte peut-il travailler ?
 *
 *  · un compte de test passe toujours (il n'a aucune conséquence) ;
 *  · un abonnement actif ou en retard ouvre l'accès ;
 *  · sinon, c'est l'essai qui décide.
 *
 * Une date d'essai absente ou illisible ouvre l'accès : c'est le seul cas où l'on ne sait pas, et
 * fermer l'outil à quelqu'un sur une colonne vide serait pire que laisser travailler un compte.
 * Le jour où la colonne disparaît, c'est la base qui est en retard sur le code — jamais l'inverse.
 */
export function accesAutorise(etat: EtatAcces | null | undefined, maintenant: Date = new Date()): boolean {
  if (etat?.est_test) return true
  if (abonnementOuvreAcces(etat?.abonnement_statut)) return true
  const fin = dateFin(etat?.essai_fin)
  if (!fin) return true
  return fin.getTime() > maintenant.getTime()
}

/**
 * Ce que lit l'artisan à qui l'assistant ou l'import est refusé. La phrase dit les trois choses
 * utiles : ce qui s'est arrêté, ce qui n'est PAS perdu, et par où repartir.
 */
export function messageEssaiTermine(): string {
  return `Tes ${ESSAI_JOURS} jours d'essai sont terminés : l'assistant et les imports sont en pause. Tes dépôts, ton planning et tes données sont toujours là. Prends ton abonnement depuis « Mon compte » pour repartir.`
}
