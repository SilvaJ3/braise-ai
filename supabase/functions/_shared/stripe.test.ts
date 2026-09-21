import { describe, expect, it } from 'vitest'
import {
  appliqueCouponFondateur,
  champsDepuisAbonnement,
  euros,
  frequenceValide,
  montantEffectif,
  parametresSession,
  prendLeCompte,
  prixPour,
  statutDepuisStripe,
  type IdentifiantsStripe,
} from './stripe.ts'

const IDS: IdentifiantsStripe = {
  prixMensuel: 'price_mensuel',
  prixAnnuel: 'price_annuel',
  couponFondateur: 'coupon_fondateur',
}

describe('la fréquence choisie', () => {
  it("n'accepte que « an » comme alternative au mois", () => {
    expect(frequenceValide('an')).toBe('an')
    expect(frequenceValide('mois')).toBe('mois')
  })

  it('retombe sur le mois pour tout le reste — on ne prélève jamais un an par accident', () => {
    expect(frequenceValide(undefined)).toBe('mois')
    expect(frequenceValide('AN')).toBe('mois')
    expect(frequenceValide('annuel')).toBe('mois')
    expect(frequenceValide(12)).toBe('mois')
    expect(frequenceValide({ frequence: 'an' })).toBe('mois')
  })

  it('donne le bon prix dans chaque cas', () => {
    expect(prixPour('mois', IDS)).toBe('price_mensuel')
    expect(prixPour('an', IDS)).toBe('price_annuel')
  })
})

describe('le tarif fondateur', () => {
  it("s'applique à un fondateur qui paie au mois", () => {
    expect(appliqueCouponFondateur('fondateur', 'mois')).toBe(true)
  })

  it("ne s'applique pas à l'annuel — 380 €/an n'a jamais été décidé", () => {
    expect(appliqueCouponFondateur('fondateur', 'an')).toBe(false)
  })

  it("ne s'applique pas aux autres plans", () => {
    expect(appliqueCouponFondateur('mensuel', 'mois')).toBe(false)
    expect(appliqueCouponFondateur('annuel', 'an')).toBe(false)
    expect(appliqueCouponFondateur('essai', 'mois')).toBe(false)
    expect(appliqueCouponFondateur(undefined, 'mois')).toBe(false)
  })
})

describe('la traduction des statuts Stripe', () => {
  it('un abonnement en cours est actif', () => {
    expect(statutDepuisStripe('active')).toBe('actif')
    expect(statutDepuisStripe('trialing')).toBe('actif')
  })

  it('un impayé est en retard, pas résilié — Stripe relance encore', () => {
    expect(statutDepuisStripe('past_due')).toBe('en_retard')
    expect(statutDepuisStripe('unpaid')).toBe('en_retard')
    expect(statutDepuisStripe('incomplete')).toBe('en_retard')
  })

  it('un abonnement terminé est résilié', () => {
    expect(statutDepuisStripe('canceled')).toBe('resilie')
    expect(statutDepuisStripe('incomplete_expired')).toBe('resilie')
  })

  it('un statut inconnu ne prétend pas que le compte paie', () => {
    expect(statutDepuisStripe('paused')).toBe('aucun')
    expect(statutDepuisStripe(null)).toBe('aucun')
    expect(statutDepuisStripe(undefined)).toBe('aucun')
  })
})

describe('ce que le compte paie réellement', () => {
  it('un fondateur paie 29 € sur un prix de 39 € — la promesse, vérifiée ici', () => {
    expect(montantEffectif(3900, { amount_off: 1000 })).toBe(2900)
    expect(euros(2900)).toBe('29 €')
  })

  it('sans coupon, le prix est celui du tarif', () => {
    expect(montantEffectif(3900, null)).toBe(3900)
    expect(montantEffectif(39000, undefined)).toBe(39000)
  })

  it('gère aussi une remise en pourcentage', () => {
    expect(montantEffectif(3900, { percent_off: 10 })).toBe(3510)
  })

  it("ne descend jamais sous zéro, même si la remise dépasse le prix", () => {
    expect(montantEffectif(1000, { amount_off: 5000 })).toBe(0)
  })

  it('rend null quand il n’y a pas de prix à lire', () => {
    expect(montantEffectif(null, null)).toBeNull()
    expect(montantEffectif(undefined, undefined)).toBeNull()
  })
})

describe('ce qu’on écrit sur le compte depuis un abonnement', () => {
  it('reprend l’identifiant, le statut, la fin de période et le montant effectif', () => {
    const champs = champsDepuisAbonnement({
      id: 'sub_123',
      status: 'active',
      current_period_end: 1_800_000_000,
      items: { data: [{ price: { unit_amount: 3900 } }] },
      discount: { coupon: { amount_off: 1000 } },
    })
    expect(champs.stripe_subscription_id).toBe('sub_123')
    expect(champs.abonnement_statut).toBe('actif')
    expect(champs.abonnement_fin).toBe(new Date(1_800_000_000 * 1000).toISOString())
    expect(champs.abonnement_prix_centimes).toBe(2900)
  })

  it('rend null plutôt qu’une date inventée quand la période n’est pas connue', () => {
    const champs = champsDepuisAbonnement({ id: 'sub_1', status: 'active' })
    expect(champs.abonnement_fin).toBeNull()
    expect(champs.abonnement_prix_centimes).toBeNull()
    expect(champs.abonnement_statut).toBe('actif')
  })
})

describe('ce qui a le droit d’écrire sur le compte', () => {
  it('un abonnement déjà suivi écrit toujours', () => {
    expect(prendLeCompte({ id: 'sub_1', status: 'active' }, 'sub_1')).toBe(true)
    expect(prendLeCompte({ id: 'sub_1', status: 'canceled' }, 'sub_1')).toBe(true)
  })

  it('un abonnement payé reprend le compte, même si un autre était suivi (re-souscription)', () => {
    expect(prendLeCompte({ id: 'sub_2', status: 'active' }, 'sub_1')).toBe(true)
    expect(prendLeCompte({ id: 'sub_2', status: 'past_due' }, 'sub_1')).toBe(true)
    expect(prendLeCompte({ id: 'sub_2', status: 'unpaid' }, 'sub_1')).toBe(true)
  })

  it('un essai de paiement refusé ne prend pas le compte — le défaut constaté le 20/09', () => {
    expect(prendLeCompte({ id: 'sub_2', status: 'incomplete' }, null)).toBe(false)
    expect(prendLeCompte({ id: 'sub_2', status: 'incomplete' }, 'sub_1')).toBe(false)
    expect(prendLeCompte({ id: 'sub_2', status: 'incomplete_expired' }, 'sub_1')).toBe(false)
  })

  it('la fin d’un abonnement qu’on ne suit pas ne touche pas le compte', () => {
    expect(prendLeCompte({ id: 'sub_2', status: 'canceled' }, 'sub_1')).toBe(false)
    expect(prendLeCompte({ id: 'sub_2', status: 'canceled' }, null)).toBe(false)
  })

  it('sans identifiant, on n’écrit rien', () => {
    expect(prendLeCompte({ id: null, status: 'active' }, null)).toBe(false)
    expect(prendLeCompte({}, null)).toBe(false)
  })
})

describe('l’écriture des montants', () => {
  it('écrit les euros comme on les écrit à un artisan', () => {
    expect(euros(2900)).toBe('29 €')
    expect(euros(39000)).toBe('390 €')
    expect(euros(2950)).toBe('29,50 €')
    expect(euros(null)).toBeNull()
  })
})

describe('les paramètres de la session de paiement', () => {
  const base = {
    frequence: 'mois' as const,
    ids: IDS,
    client: 'cus_essai',
    utilisateurId: 'user_1',
    url: 'https://braise-ai.vercel.app',
    plan: 'mensuel' as unknown,
  }

  it('demande la TVA à Stripe — c’est la décision du 21/09', () => {
    expect(parametresSession(base).automatic_tax).toEqual({ enabled: true })
  })

  it('enregistre l’adresse saisie sur le client, sinon les renouvellements ne sont pas taxés', () => {
    expect(parametresSession(base).customer_update).toEqual({ address: 'auto' })
    expect(parametresSession(base).customer).toBe('cus_essai')
  })

  it('prend le prix de la fréquence choisie', () => {
    expect(parametresSession({ ...base, frequence: 'an' }).line_items).toEqual([
      { price: 'price_annuel', quantity: 1 },
    ])
    expect(parametresSession(base).line_items).toEqual([{ price: 'price_mensuel', quantity: 1 }])
  })

  it('n’applique le coupon fondateur qu’au mensuel d’un fondateur', () => {
    expect(parametresSession({ ...base, plan: 'fondateur' }).discounts).toEqual([
      { coupon: 'coupon_fondateur' },
    ])
    expect(parametresSession({ ...base, plan: 'fondateur', frequence: 'an' }).discounts).toBeUndefined()
    expect(parametresSession({ ...base, plan: 'mensuel' }).discounts).toBeUndefined()
  })

  it('rattache la session et l’abonnement au compte connecté', () => {
    const p = parametresSession(base)
    expect(p.client_reference_id).toBe('user_1')
    expect(p.subscription_data).toEqual({ metadata: { user_id: 'user_1' } })
  })

  it('revient au bon endroit selon que le paiement aboutit ou non', () => {
    const p = parametresSession(base)
    expect(p.success_url).toBe('https://braise-ai.vercel.app/compte/mon-compte?paiement=ok')
    expect(p.cancel_url).toBe('https://braise-ai.vercel.app/compte/mon-compte?paiement=annule')
  })

  it('supporte une adresse d’application terminée par une barre oblique', () => {
    const p = parametresSession({ ...base, url: 'https://braise-ai.vercel.app/' })
    expect(p.success_url).toBe('https://braise-ai.vercel.app/compte/mon-compte?paiement=ok')
    expect(p.cancel_url).toBe('https://braise-ai.vercel.app/compte/mon-compte?paiement=annule')
  })
})
