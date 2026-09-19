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
 * Le tarif fondateur ne s'applique qu'à l'abonnement **mensuel** : l'offre est « 29 € par mois
 * pendant deux ans ». Sur l'annuel, le même coupon donnerait 380 €/an — un prix qui n'a jamais été
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
  current_period_end?: number | null
  items?: { data?: Array<{ price?: { unit_amount?: number | null } | null }> } | null
  discount?: { coupon?: { amount_off?: number | null; percent_off?: number | null } | null } | null
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
 */
export function champsDepuisAbonnement(sub: AbonnementStripe): {
  stripe_subscription_id: string | null
  abonnement_statut: 'actif' | 'en_retard' | 'resilie' | 'aucun'
  abonnement_fin: string | null
  abonnement_prix_centimes: number | null
} {
  const prix = sub.items?.data?.[0]?.price ?? null
  return {
    stripe_subscription_id: sub.id ?? null,
    abonnement_statut: statutDepuisStripe(sub.status),
    abonnement_fin:
      typeof sub.current_period_end === 'number'
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
    abonnement_prix_centimes: montantEffectif(prix?.unit_amount ?? null, sub.discount?.coupon ?? null),
  }
}

/** Le montant en euros, écrit comme on l'écrit à un artisan : « 29 € », « 390 € ». */
export function euros(centimes: number | null | undefined): string | null {
  if (typeof centimes !== 'number') return null
  const entier = centimes / 100
  return Number.isInteger(entier) ? `${entier} €` : `${entier.toFixed(2).replace('.', ',')} €`
}
