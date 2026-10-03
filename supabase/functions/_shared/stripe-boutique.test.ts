import { describe, expect, it } from 'vitest'
import {
  CIBLE_BOUTIQUE,
  boutiquePrendLAbonnement,
  champsBoutiqueDepuisAbonnement,
  cibleDuWebhook,
  finEssaiPourAccesOffert,
  lienDepuisMetadonnees,
  metadonneesBoutique,
} from './stripe-boutique'

const LIEN = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

describe('marquage d’une session de boutique', () => {
  it('pose la cible et le lien, et le webhook les relit', () => {
    const meta = metadonneesBoutique(LIEN)
    expect(meta).toEqual({ braaise_cible: CIBLE_BOUTIQUE, lien_id: LIEN })
    expect(lienDepuisMetadonnees(meta)).toBe(LIEN)
  })

  it('un lien illisible ou une autre cible ne donne pas de lien', () => {
    expect(lienDepuisMetadonnees(null)).toBeNull()
    expect(lienDepuisMetadonnees({})).toBeNull()
    expect(lienDepuisMetadonnees({ braaise_cible: 'boutique', lien_id: 'pas-un-uuid' })).toBeNull()
    expect(lienDepuisMetadonnees({ braaise_cible: 'artisan', lien_id: LIEN })).toBeNull()
  })
})

describe('à qui appartient un événement Stripe', () => {
  it('une boutique marquée est reconnue, sur n’importe laquelle des métadonnées fournies', () => {
    expect(cibleDuWebhook({}, metadonneesBoutique(LIEN))).toEqual({ cible: 'boutique', lienId: LIEN })
    expect(cibleDuWebhook(metadonneesBoutique(LIEN), null)).toEqual({ cible: 'boutique', lienId: LIEN })
  })

  it('aucun marquage : c’est le chemin de l’artisan, inchangé', () => {
    expect(cibleDuWebhook()).toEqual({ cible: 'artisan' })
    expect(cibleDuWebhook({}, null, { client: 'x' })).toEqual({ cible: 'artisan' })
    expect(cibleDuWebhook({ user_id: 'abc' })).toEqual({ cible: 'artisan' })
  })

  it('marquage « boutique » mais lien illisible : inconnu, JAMAIS renvoyé vers l’artisan', () => {
    expect(cibleDuWebhook({ braaise_cible: 'boutique' })).toEqual({ cible: 'inconnu' })
    expect(cibleDuWebhook({ braaise_cible: 'boutique', lien_id: 'xx' }, {})).toEqual({ cible: 'inconnu' })
  })

  it('un marquage valide gagne sur un marquage illisible', () => {
    expect(cibleDuWebhook({ braaise_cible: 'boutique', lien_id: 'xx' }, metadonneesBoutique(LIEN))).toEqual({
      cible: 'boutique',
      lienId: LIEN,
    })
  })
})

describe('un abonnement Stripe traduit pour la boutique', () => {
  const fin = Math.floor(Date.UTC(2026, 10, 20, 12) / 1000)
  const sub = (over: Record<string, unknown> = {}) => ({
    id: 'sub_1',
    status: 'active',
    items: { data: [{ current_period_end: fin, price: { id: 'price_b', unit_amount: 4900 } }] },
    ...over,
  })

  it('écrit le statut, la fin de période EN DATE, le prix et la fréquence mensuelle', () => {
    expect(champsBoutiqueDepuisAbonnement(sub())).toEqual({
      stripe_subscription_id: 'sub_1',
      statut: 'actif',
      abonnement_fin: '2026-11-20',
      abonnement_prix_centimes: 4900,
      abonnement_annule: false,
      abonnement_frequence: 'mensuel',
    })
  })

  it('un abonnement en essai (accès offert respecté) compte pour actif, avec la date du premier prélèvement', () => {
    const c = champsBoutiqueDepuisAbonnement(sub({ status: 'trialing', trial_end: fin }))
    expect(c.statut).toBe('actif')
    expect(c.abonnement_fin).toBe('2026-11-20')
  })

  it('le prix est net de la remise en cours', () => {
    const c = champsBoutiqueDepuisAbonnement(sub({ discount: { coupon: { amount_off: 2401 } } }))
    expect(c.abonnement_prix_centimes).toBe(2499)
  })

  it('une résiliation passée par le portail (cancel_at, booléen à faux) est vue', () => {
    expect(champsBoutiqueDepuisAbonnement(sub({ cancel_at: fin, cancel_at_period_end: false })).abonnement_annule).toBe(true)
    expect(champsBoutiqueDepuisAbonnement(sub({ status: 'canceled', cancel_at: fin })).abonnement_annule).toBe(false)
  })

  it('un prélèvement refusé devient « en retard », un abonnement terminé « résilié »', () => {
    expect(champsBoutiqueDepuisAbonnement(sub({ status: 'past_due' })).statut).toBe('en_retard')
    expect(champsBoutiqueDepuisAbonnement(sub({ status: 'canceled' })).statut).toBe('resilie')
  })

  it('une fin de période absente reste null au lieu de devenir une date inventée', () => {
    expect(champsBoutiqueDepuisAbonnement({ id: 'sub_2', status: 'active' }).abonnement_fin).toBeNull()
  })

  it('une carte refusée (incomplete) n’écrit pas sur la boutique, sauf si c’est l’abonnement suivi', () => {
    expect(boutiquePrendLAbonnement({ id: 's', status: 'incomplete' }, 'autre')).toBe(false)
    expect(boutiquePrendLAbonnement({ id: 's', status: 'incomplete' }, 's')).toBe(true)
    expect(boutiquePrendLAbonnement({ id: 's', status: 'active' }, null)).toBe(true)
  })
})

describe('le premier paiement quand on s’abonne pendant l’accès offert', () => {
  const maintenant = new Date('2026-10-20T10:00:00Z')

  it('démarre en essai jusqu’au LENDEMAIN de la fin de l’accès (jour indiqué inclus)', () => {
    expect(finEssaiPourAccesOffert('2027-01-20', maintenant)).toBe(Math.floor(Date.UTC(2027, 0, 21) / 1000))
    // passage de mois et d'année : le 31/12 inclus → paiement le 01/01
    expect(finEssaiPourAccesOffert('2026-12-31', maintenant)).toBe(Math.floor(Date.UTC(2027, 0, 1) / 1000))
  })

  it('pas d’accès offert à respecter : paiement immédiat', () => {
    expect(finEssaiPourAccesOffert(null, maintenant)).toBeNull()
    expect(finEssaiPourAccesOffert(undefined, maintenant)).toBeNull()
    expect(finEssaiPourAccesOffert('bientôt', maintenant)).toBeNull()
    expect(finEssaiPourAccesOffert('2026-10-01', maintenant)).toBeNull()
  })

  it('moins de 48 h restantes : on ne rallonge pas l’essai, paiement immédiat', () => {
    expect(finEssaiPourAccesOffert('2026-10-20', maintenant)).toBeNull()
    expect(finEssaiPourAccesOffert('2026-10-21', maintenant)).toBeNull()
    expect(finEssaiPourAccesOffert('2026-10-23', maintenant)).not.toBeNull()
  })
})
