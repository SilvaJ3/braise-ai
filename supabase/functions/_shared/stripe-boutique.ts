// Stripe côté BOUTIQUE : les décisions, isolées du réseau (comme `_shared/stripe.ts` pour l'artisan).
//
// Ce fichier ne parle pas à Stripe et n'importe pas son SDK : tout est testable sans clé ni compte.
// Il répond à trois questions :
//   · cette session ou cet abonnement est-il celui d'une BOUTIQUE (et de laquelle) ? — le webhook sert
//     les deux espaces avec une seule adresse ; sans cette réponse, un abonnement de boutique serait
//     écarté en silence (« aucun compte pour ce client »), car le webhook cherche l'artisan ;
//   · que faut-il écrire dans `boutique_abonnements` (0082) à partir de ce que Stripe dit ?
//   · quand le premier paiement doit-il tomber si la boutique s'abonne PENDANT son accès offert ?
//
// Règle de fond : un abonnement de boutique n'écrit JAMAIS dans `assistant_profil` (table de l'artisan),
// et un abonnement d'artisan n'écrit jamais ici. Le marquage se fait à la création de la session, par
// des métadonnées que Stripe recopie sur l'abonnement.

import {
  champsDepuisAbonnement,
  prendLeCompte,
  type AbonnementStripe,
} from './stripe.ts'

/** La valeur posée dans les métadonnées d'une session et d'un abonnement de boutique. */
export const CIBLE_BOUTIQUE = 'boutique'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Les métadonnées à poser sur la session ET sur l'abonnement (`subscription_data.metadata`) : c'est ce
 * qui permet au webhook de reconnaître une boutique sans jamais deviner. `lien_id` est le lien de la
 * boutique (`boutique_liens.id`), retrouvé côté serveur depuis le compte connecté — jamais fourni par
 * l'appelant.
 */
export function metadonneesBoutique(lienId: string): Record<string, string> {
  return { braaise_cible: CIBLE_BOUTIQUE, lien_id: lienId }
}

/**
 * Le lien de boutique que portent ces métadonnées, ou `null` si elles ne sont pas celles d'une boutique.
 * Un marquage « boutique » sans identifiant valide n'est PAS pris pour une boutique, ni pour un artisan :
 * il renvoie `null` et le webhook décide quoi faire (voir `cibleDuWebhook`).
 */
export function lienDepuisMetadonnees(meta: Record<string, string | null | undefined> | null | undefined): string | null {
  if (!meta || meta.braaise_cible !== CIBLE_BOUTIQUE) return null
  const id = meta.lien_id?.trim() ?? ''
  return UUID.test(id) ? id : null
}

/**
 * À qui appartient cet événement Stripe ? Trois réponses, et la troisième est la sûre :
 *   · `boutique` : le marquage est là et valide → on écrit dans `boutique_abonnements` ;
 *   · `artisan`  : aucun marquage « boutique » → le chemin d'avant, inchangé ;
 *   · `inconnu`  : marquage « boutique » mais identifiant illisible → on n'écrit NULLE PART, on journalise.
 *     Le renvoyer vers l'artisan écrirait un abonnement de boutique sur un compte d'artisan.
 */
export function cibleDuWebhook(
  ...metas: Array<Record<string, string | null | undefined> | null | undefined>
): { cible: 'boutique'; lienId: string } | { cible: 'artisan' } | { cible: 'inconnu' } {
  let marque = false
  for (const m of metas) {
    if (m?.braaise_cible === CIBLE_BOUTIQUE) marque = true
    const lien = lienDepuisMetadonnees(m)
    if (lien) return { cible: 'boutique', lienId: lien }
  }
  return marque ? { cible: 'inconnu' } : { cible: 'artisan' }
}

/** Ce qu'on écrit dans `boutique_abonnements` à partir d'un abonnement Stripe. */
export type ChampsAbonnementBoutique = {
  stripe_subscription_id: string | null
  statut: 'actif' | 'en_retard' | 'resilie' | 'aucun'
  /** `date` en base : le jour de fin de période, `YYYY-MM-DD`. */
  abonnement_fin: string | null
  abonnement_prix_centimes: number | null
  abonnement_annule: boolean
  /** Seule la formule mensuelle existe pour une boutique (décision 6, 04/10 : pas d'annuel). */
  abonnement_frequence: 'mensuel'
}

/**
 * Traduit un abonnement Stripe pour une boutique. On réutilise la traduction de l'artisan (statut, fin de
 * période à deux emplacements, résiliation programmée par le portail, prix net de remise) : une seule
 * lecture de Stripe, pour ne pas la faire diverger. Deux différences seulement : la fin de période
 * s'écrit en `date`, et la fréquence est toujours « mensuel ».
 */
export function champsBoutiqueDepuisAbonnement(sub: AbonnementStripe): ChampsAbonnementBoutique {
  const c = champsDepuisAbonnement(sub)
  return {
    stripe_subscription_id: c.stripe_subscription_id,
    statut: c.abonnement_statut,
    abonnement_fin: c.abonnement_fin ? c.abonnement_fin.slice(0, 10) : null,
    abonnement_prix_centimes: c.abonnement_prix_centimes,
    abonnement_annule: c.abonnement_annule,
    abonnement_frequence: 'mensuel',
  }
}

/** Un abonnement a-t-il le droit d'écrire sur la boutique ? Même règle que pour l'artisan (carte refusée, abonnement terminé). */
export function boutiquePrendLAbonnement(sub: AbonnementStripe, abonnementSuivi: string | null | undefined): boolean {
  return prendLeCompte(sub, abonnementSuivi)
}

/** Stripe refuse une fin d'essai à moins de 48 h : en deçà, on démarre le paiement tout de suite. */
const MARGE_ESSAI_MS = 49 * 3_600_000

/**
 * Quand le premier paiement doit-il tomber ? Une boutique qui s'abonne PENDANT son accès offert ne doit
 * pas perdre ses mois offerts : l'abonnement démarre en essai jusqu'au lendemain de la fin de l'accès
 * (l'accès court jusqu'au jour indiqué INCLUS, comme `>= current_date` en base), et c'est seulement ce
 * jour-là que la carte est prélevée — par un geste qu'elle a elle-même fait en s'abonnant.
 *
 * Rend un horodatage Unix (secondes) pour `subscription_data.trial_end`, ou `null` quand il n'y a pas
 * d'accès offert à respecter : pas d'accès, date illisible, date passée, ou fin à moins de 48 h
 * (on ne rallonge pas l'essai au-delà de ce qui était offert).
 */
export function finEssaiPourAccesOffert(accesOffertJusquAu: string | null | undefined, maintenant: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(accesOffertJusquAu ?? '')
  if (!m) return null
  const lendemain = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)
  if (Number.isNaN(lendemain) || lendemain - maintenant.getTime() < MARGE_ESSAI_MS) return null
  return Math.floor(lendemain / 1000)
}
