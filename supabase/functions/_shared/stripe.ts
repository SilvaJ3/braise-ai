// Stripe : les décisions, isolées du réseau.
//
// Ce fichier ne parle pas à Stripe et n'importe pas son SDK. Il contient ce qui doit être juste :
// quel prix utiliser, quand appliquer le tarif fondateur, comment traduire un statut d'abonnement,
// et combien le compte paie réellement. Tout est donc testable sans clé, sans compte et sans réseau.

export type Frequence = 'mois' | 'an'

/** Les trois identifiants que les fonctions attendent en secrets — jamais écrits en dur. */
export type IdentifiantsStripe = {
  prixMensuel: string
  prixAnnuel: string
  couponFondateur: string
}

/** Une fréquence inconnue retombe sur le mois : on ne prélève jamais l'annuel par accident. */
export function frequenceValide(v: unknown): Frequence {
  return v === 'an' ? 'an' : 'mois'
}

export function prixPour(f: Frequence, ids: IdentifiantsStripe): string {
  return f === 'an' ? ids.prixAnnuel : ids.prixMensuel
}

/**
 * La demande d'accès immédiat et la renonciation au droit de rétractation, écrites UNE fois : elles
 * s'affichent à l'écran avant la case à cocher, partent sur la page de paiement Stripe, et sont la
 * raison pour laquelle une personne qui paie au 8e jour ne peut plus se rétracter pendant quatorze
 * jours (art. VI.47 et s. CDE — c'est l'accord exprès qui fait commencer le service tout de suite).
 * Sans cet accord, le service est un contrat à distance ordinaire : la personne peut demander à être
 * remboursée pendant quatorze jours, et la vente d'un premier mois ne tient pas.
 */
export const RENONCIATION_RETRACTATION =
  "En validant, tu acceptes les conditions générales et tu demandes que ton accès commence tout de suite : tu renonces ainsi au droit de rétractation de 14 jours. Ton abonnement reste résiliable à tout moment depuis « Mon compte »."

/** Ce que répond la fonction quand l'accord manque : l'écran l'affiche tel quel. */
export const RENONCIATION_REQUISE =
  "Coche l'accord d'accès immédiat avant de continuer : sans lui, ton abonnement ne peut pas démarrer aujourd'hui."

/**
 * Le tarif fondateur ne s'applique qu'à l'abonnement **mensuel** : l'offre est « 29 € HTVA par mois
 * la première année ». Sur l'annuel, le même coupon donnerait 380 €/an — un prix qui n'a jamais été
 * décidé. Donc on ne l'applique pas, et le fondateur qui choisit l'annuel paie 390 €/an.
 */
export function appliqueCouponFondateur(plan: unknown, f: Frequence): boolean {
  return plan === 'fondateur' && f === 'mois'
}

/** Statut d'abonnement côté Stripe → statut du compte. */
export function statutDepuisStripe(statutStripe: unknown): 'actif' | 'en_retard' | 'resilie' | 'aucun' {
  switch (statutStripe) {
    case 'active':
    case 'trialing':
      return 'actif'
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'en_retard'
    case 'canceled':
    case 'incomplete_expired':
      return 'resilie'
    default:
      return 'aucun'
  }
}

/** Le morceau d'abonnement Stripe dont on a besoin — forme minimale, pour rester testable. */
export type AbonnementStripe = {
  id?: string | null
  status?: string | null
  /**
   * Fin de la période en cours. **Stripe ne la met plus à ce niveau** depuis la version d'API 2025
   * (constaté le 03/10/2026 : `null` ici, la valeur est sur l'item). Gardé pour l'ancien
   * emplacement, qui reste lu en second recours.
   */
  current_period_end?: number | null
  /** Fin de l'essai, quand l'abonnement est en essai : `null` sur un abonnement payé. */
  trial_end?: number | null
  /** L'abonnement s'arrête à la fin de la période : personne ne sera prélevé une fois de plus. */
  cancel_at_period_end?: boolean | null
  /**
   * L'horodatage exact de l'arrêt, quand la résiliation est programmée à une date précise. C'est
   * ce que pose le portail Stripe quand on clique « Annuler l'abonnement » — et il laisse
   * `cancel_at_period_end` à `false`. Ne lire que le booléen, c'est ne pas voir la résiliation.
   */
  cancel_at?: number | null
  items?: {
    data?: Array<{
      /** Là où Stripe met aujourd'hui la fin de période (version d'API 2025+). */
      current_period_end?: number | null
      price?: { id?: string | null; unit_amount?: number | null } | null
    }> | null
  } | null
  discount?: { coupon?: { amount_off?: number | null; percent_off?: number | null } | null } | null
}

/**
 * La fin de la période en cours, en secondes Unix, ou `null`.
 *
 * Deux emplacements, et l'ordre compte : `items.data[0].current_period_end` est celui qu'utilise
 * Stripe aujourd'hui, l'ancien n'est lu que s'il n'y a rien sur l'item. Constaté le 03/10/2026 sur
 * un abonnement réel : la valeur au niveau de l'abonnement était `null` alors que l'item portait la
 * date. Ne lire que l'ancien emplacement faisait écrire `null`, et `stripe-webhook` retirait alors
 * le champ de son écriture — la date en base restait figée sur un événement antérieur, et l'écran
 * annonçait une échéance périmée comme si elle était à jour.
 */
export function finDePeriode(sub: AbonnementStripe): number | null {
  const surItem = sub.items?.data?.[0]?.current_period_end
  if (typeof surItem === 'number') return surItem
  if (typeof sub.current_period_end === 'number') return sub.current_period_end
  return null
}

/** Ce qu'un compte paie réellement : le prix du mois, moins la remise en cours. */
export function montantEffectif(
  unitAmount: number | null | undefined,
  coupon: { amount_off?: number | null; percent_off?: number | null } | null | undefined,
): number | null {
  if (typeof unitAmount !== 'number') return null
  if (!coupon) return unitAmount
  if (typeof coupon.amount_off === 'number' && coupon.amount_off > 0) {
    return Math.max(0, unitAmount - coupon.amount_off)
  }
  if (typeof coupon.percent_off === 'number' && coupon.percent_off > 0) {
    return Math.round(unitAmount * (1 - coupon.percent_off / 100))
  }
  return unitAmount
}

/**
 * Ce qu'on écrit sur le compte à partir d'un abonnement Stripe. Un abonnement sans fin de période
 * connue n'écrase pas une date déjà enregistrée : on ne remplace pas une information par du vide.
 *
 * `abonnement_annule` dit que l'abonnement s'arrête à la fin de la période. Deux écritures à lire,
 * parce que Stripe en utilise deux selon le chemin : le booléen `cancel_at_period_end` (résiliation
 * « à la fin de la période ») et `cancel_at` (arrêt à une date précise), que le **portail Stripe**
 * pose quand on clique « Annuler l'abonnement » — il laisse alors le booléen à `false`. Constaté le
 * 03/10/2026 : ne lire que le booléen, c'est ignorer toute résiliation passée par le portail.
 *
 * Un `cancel_at` sur un abonnement déjà terminé ne compte pas : ce n'est pas une résiliation à
 * venir, c'est une date passée — et l'écran annoncerait un arrêt qui a déjà eu lieu.
 */
export function champsDepuisAbonnement(
  sub: AbonnementStripe,
  repere?: { prixAnnuel?: string | null },
): {
  stripe_subscription_id: string | null
  abonnement_statut: 'actif' | 'en_retard' | 'resilie' | 'aucun'
  abonnement_fin: string | null
  abonnement_prix_centimes: number | null
  essai_fin: string | null
  abonnement_annule: boolean
  abonnement_frequence: 'mois' | 'an' | null
} {
  const prix = sub.items?.data?.[0]?.price ?? null
  const annuel = repere?.prixAnnuel ?? null
  const statut = statutDepuisStripe(sub.status)
  const fin = finDePeriode(sub)
  return {
    stripe_subscription_id: sub.id ?? null,
    abonnement_statut: statut,
    abonnement_fin: typeof fin === 'number' ? new Date(fin * 1000).toISOString() : null,
    abonnement_prix_centimes: montantEffectif(prix?.unit_amount ?? null, sub.discount?.coupon ?? null),
    essai_fin:
      typeof sub.trial_end === 'number' ? new Date(sub.trial_end * 1000).toISOString() : null,
    abonnement_annule:
      statut !== 'resilie' && (sub.cancel_at_period_end === true || typeof sub.cancel_at === 'number'),
    abonnement_frequence: prix?.id && annuel ? (prix.id === annuel ? 'an' : 'mois') : null,
  }
}

/**
 * Un abonnement a-t-il le droit d'écrire sur le compte ?
 *
 * Constaté le 20/09/2026 en exerçant le parcours d'achat pour de vrai : un paiement **refusé** crée
 * quand même un abonnement chez Stripe, en statut `incomplete` (la première facture n'est jamais
 * payée). Le webhook l'écrivait sur le compte comme les autres, si bien qu'une carte refusée
 * remplaçait l'abonnement en cours et affichait « en retard » sur un compte qui paie. Même piège
 * avec un abonnement qu'on ne suit pas et qui se termine : sa résiliation marquait le compte
 * « résilié ».
 *
 * La règle, donc : un abonnement déjà suivi écrit toujours ; un autre écrit s'il a été payé
 * (`active`, `trialing`, `past_due`, `unpaid` — un abonnement qui reprend après une résiliation doit
 * pouvoir reprendre le compte) ; un abonnement jamais payé (`incomplete`, `incomplete_expired`) ou
 * déjà terminé (`canceled`) n'écrit pas s'il n'est pas celui qu'on suit.
 */
export function prendLeCompte(
  sub: AbonnementStripe,
  abonnementSuivi: string | null | undefined,
): boolean {
  if (!sub.id) return false
  if (sub.id === abonnementSuivi) return true
  switch (sub.status) {
    case 'incomplete':
    case 'incomplete_expired':
    case 'canceled':
      return false
    default:
      return true
  }
}

/** Le montant en euros, écrit comme on l'écrit à un artisan : « 29 € », « 390 € ». */
export function euros(centimes: number | null | undefined): string | null {
  if (typeof centimes !== 'number') return null
  const entier = centimes / 100
  return Number.isInteger(entier) ? `${entier} €` : `${entier.toFixed(2).replace('.', ',')} €`
}
