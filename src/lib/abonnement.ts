// L'abonnement côté écran : ce qui se décide sans réseau — quel statut afficher, quel montant
// annoncer, quoi dire au retour de la page de paiement. Module PUR, donc testable.
//
// Les appels (ouvrir une session de paiement, ouvrir le portail Stripe) vivent dans `profil.ts`,
// avec les autres lectures du compte : ici il n'y a ni client Supabase ni effet de bord.
//
// Deux sources, et elles ne disent pas la même chose : ce module porte l'**offre** (39 €/mois,
// 390 €/an, 29 €/mois au tarif fondateur), la base porte ce qui est **réellement prélevé**
// (`abonnement_prix_centimes`, écrit par le webhook depuis Stripe). L'écran montre les deux quand
// ils diffèrent — un fondateur dont le coupon a expiré doit le voir.

import type { Plan } from '../../supabase/functions/_shared/compte'
// La remise fondateur est décidée côté serveur (`appliqueCouponFondateur`, partagée avec
// `stripe-checkout`) : on relit la même règle ici, sinon l'écran finirait par annoncer un prix que
// Stripe ne prélève pas.
import { appliqueCouponFondateur, euros } from '../../supabase/functions/_shared/stripe'

/** La fréquence demandée à la page de paiement. Inconnue = le mois (jamais l'annuel par accident). */
export type FrequenceAbonnement = 'mois' | 'an'

export type StatutAbonnement = 'aucun' | 'actif' | 'en_retard' | 'resilie'

/** Les deux formules proposées, en centimes : c'est l'offre affichée sur l'écran. */
export const OFFRES: Record<FrequenceAbonnement, { centimes: number; libelle: string }> = {
  mois: { centimes: 3900, libelle: '39 €/mois' },
  an: { centimes: 39000, libelle: '390 €/an' },
}

/** Le tarif fondateur : 29 €/mois pendant deux ans, appliqué par un coupon Stripe, sans code à saisir. */
export const TARIF_FONDATEUR_CENTIMES = 2900

export const FREQUENCES: FrequenceAbonnement[] = ['mois', 'an']

/** Un statut inconnu (valeur absente, colonne non lue) ne s'affiche jamais tel quel : il compte pour « aucun ». */
export function statutAbonnement(v: unknown): StatutAbonnement {
  return v === 'actif' || v === 'en_retard' || v === 'resilie' ? v : 'aucun'
}

/** Le montant que l'écran annonce pour une formule, tarif fondateur appliqué s'il y a lieu. */
export function montantOffre(
  frequence: FrequenceAbonnement,
  plan: Plan | string | null | undefined,
): number {
  return appliqueCouponFondateur(plan, frequence) ? TARIF_FONDATEUR_CENTIMES : OFFRES[frequence].centimes
}

/** Un montant en centimes écrit comme on l'écrit à un artisan (« 29 € », « 390 € »), ou null. */
export function montantLisible(centimes: number | null | undefined): string | null {
  return euros(centimes)
}

/** Une date ISO écrite pour un artisan (« 20 octobre 2026 »), ou null si la valeur est inutilisable. */
export function dateLisible(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** La date est-elle encore devant nous ? Une date illisible ne compte pas comme future. */
function dansLeFutur(iso: string | null | undefined, maintenant: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return !Number.isNaN(d.getTime()) && d.getTime() > maintenant.getTime()
}

export type EtatAbonnement = {
  statut: StatutAbonnement
  /** Le mot du badge : « Actif », « En retard », « Terminé », « Aucun ». */
  badge: string
  /** La phrase expliquant où en est le paiement, et ce qui va se passer. */
  phrase: string
  /** La fin de période écrite pour un artisan, ou null. */
  fin: string | null
  /** L'écran propose-t-il de souscrire ? */
  peutSouscrire: boolean
  /** L'écran propose-t-il d'ouvrir le portail Stripe (carte, factures, résiliation) ? */
  peutGerer: boolean
}

/**
 * L'état complet de l'abonnement tel qu'il doit s'afficher. Rien n'est inventé sur ce qui n'est pas
 * mesurable : on ne sait pas si l'accès est coupé un jour de retard de prélèvement (il ne l'est
 * pas), donc l'écran parle de la carte, pas de l'accès.
 */
export function etatAbonnement(
  statutBrut: unknown,
  options: { fin?: string | null; maintenant?: Date } = {},
): EtatAbonnement {
  const statut = statutAbonnement(statutBrut)
  const maintenant = options.maintenant ?? new Date()
  const fin = dateLisible(options.fin)
  const finDevant = dansLeFutur(options.fin, maintenant)

  switch (statut) {
    case 'actif':
      return {
        statut,
        badge: 'Actif',
        phrase: finDevant
          ? `Abonnement en cours. Prochain prélèvement le ${fin}.`
          : 'Abonnement en cours.',
        fin,
        peutSouscrire: false,
        peutGerer: true,
      }
    case 'en_retard':
      return {
        statut,
        badge: 'En retard',
        phrase:
          'Un prélèvement a échoué. Stripe relance tout seul pendant quelques jours ; mets ta carte à jour si le problème vient d’elle.',
        fin,
        peutSouscrire: false,
        peutGerer: true,
      }
    case 'resilie':
      return {
        statut,
        badge: 'Terminé',
        phrase: finDevant
          ? `Abonnement résilié : il reste actif jusqu’au ${fin}.`
          : 'Abonnement terminé : plus rien n’est prélevé.',
        fin,
        peutSouscrire: true,
        peutGerer: true,
      }
    default:
      return {
        statut: 'aucun',
        badge: 'Aucun',
        phrase: 'Aucun abonnement en cours : rien n’est prélevé.',
        fin: null,
        peutSouscrire: true,
        peutGerer: false,
      }
  }
}

export type MessagePaiement = { ton: 'ok' | 'info'; texte: string }

/**
 * Ce que la page de paiement a laissé dans l'adresse au retour. Stripe revient sur
 * `/compte/mon-compte?paiement=ok` ou `?paiement=annule` (voir `stripe-checkout`).
 *
 * Au retour d'un paiement accepté, le webhook n'a pas forcément encore écrit en base : la phrase le
 * dit au lieu de laisser croire à un échec.
 */
export function messagePaiement(param: string | null | undefined): MessagePaiement | null {
  if (param === 'ok') {
    return {
      ton: 'ok',
      texte:
        'Paiement reçu. Ton abonnement s’active — ça peut prendre quelques secondes avant de s’afficher ici.',
    }
  }
  if (param === 'annule') {
    return { ton: 'info', texte: 'Paiement annulé : rien n’a été prélevé. Tu peux reprendre quand tu veux.' }
  }
  return null
}

/**
 * La formule à laquelle correspond un montant réellement prélevé, quand elle est identifiable.
 * Les montants viennent du webhook (Stripe), pas de l'écran : un montant inconnu ne s'affiche
 * jamais comme si on l'avait reconnu — il rend null.
 */
export function formuleFacturee(
  centimes: number | null | undefined,
): { libelle: string; frequence: FrequenceAbonnement; tarif: 'fondateur' | 'public' } | null {
  if (centimes === TARIF_FONDATEUR_CENTIMES) {
    return { libelle: '29 €/mois', frequence: 'mois', tarif: 'fondateur' }
  }
  if (centimes === OFFRES.mois.centimes) {
    return { libelle: OFFRES.mois.libelle, frequence: 'mois', tarif: 'public' }
  }
  if (centimes === OFFRES.an.centimes) {
    return { libelle: OFFRES.an.libelle, frequence: 'an', tarif: 'public' }
  }
  return null
}

/** Le libellé du bouton qui ouvre le paiement, montant annoncé compris. */
export function libelleSouscription(
  frequence: FrequenceAbonnement,
  plan: Plan | string | null | undefined,
): string {
  const montant = montantLisible(montantOffre(frequence, plan)) ?? ''
  const offre = frequence === 'an' ? `${montant}/an` : `${montant}/mois`
  return `S’abonner — ${offre}`
}

/** Le rappel de l'offre fondateur, quand elle vaut pour ce compte. */
export function noteFondateur(plan: Plan | string | null | undefined): string | null {
  if (plan !== 'fondateur') return null
  return 'Tarif fondateur : 29 €/mois pendant deux ans (au lieu de 39 €), appliqué automatiquement au paiement mensuel.'
}

/**
 * Un fondateur dont le coupon a expiré paie de nouveau 39 € : c'est exactement ce que la colonne
 * `abonnement_prix_centimes` existe pour montrer, et l'écran doit le dire plutôt que de laisser
 * croire que le prix bloqué tient toujours.
 */
export function alerteTarif(
  plan: Plan | string | null | undefined,
  centimes: number | null | undefined,
): string | null {
  if (plan !== 'fondateur') return null
  const formule = formuleFacturee(centimes)
  if (formule && formule.tarif === 'public' && formule.frequence === 'mois') {
    return 'Ton abonnement est facturé 39 €/mois : le tarif fondateur ne s’applique plus. Écris-moi si tu penses que c’est une erreur.'
  }
  return null
}
