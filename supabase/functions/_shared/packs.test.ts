import { describe, expect, it } from 'vitest'
import {
  clefCredit,
  creditDepuisSession,
  metadonneesPack,
  PACK_IDS,
  PACKS,
  packValide,
  prixPack,
  type IdentifiantsPacks,
  type SessionPaiement,
} from './packs.ts'

const IDS: IdentifiantsPacks = { pack30: 'price_pack_30', pack50: 'price_pack_50' }
const COMPTE = '8b7c1c1e-1a2b-4c3d-9e8f-0a1b2c3d4e5f'

/** Une session d'achat de pack telle que `stripe-checkout` la crée. */
const sessionPack = (surcharge: Partial<SessionPaiement> = {}): SessionPaiement => ({
  id: 'cs_test_pack_30',
  mode: 'payment',
  payment_status: 'paid',
  client_reference_id: COMPTE,
  metadata: metadonneesPack(COMPTE, 'pack_30'),
  ...surcharge,
})

describe('les packs', () => {
  it('donne les deux packs décidés, aux bons montants et aux bons jetons', () => {
    expect(PACK_IDS).toEqual(['pack_30', 'pack_50'])
    expect(PACKS.pack_30.centimes).toBe(3_000)
    expect(PACKS.pack_30.jetons).toBe(3_000_000)
    expect(PACKS.pack_50.centimes).toBe(5_000)
    expect(PACKS.pack_50.jetons).toBe(6_000_000)
  })

  it('dit le prix ET l’ordre de grandeur en questions, jamais des jetons seuls', () => {
    expect(PACKS.pack_30.libelle).toContain('30 €')
    expect(PACKS.pack_30.libelle).toContain('questions')
    expect(PACKS.pack_50.libelle).toContain('50 €')
  })

  it('n’accepte que les packs connus, jamais un pack par défaut', () => {
    expect(packValide('pack_30')).toBe('pack_30')
    expect(packValide('pack_50')).toBe('pack_50')
    expect(packValide('pack_10')).toBeNull()
    expect(packValide('')).toBeNull()
    expect(packValide(null)).toBeNull()
    expect(packValide({ pack: 'pack_30' })).toBeNull()
  })

  it('lit ses deux prix dans les secrets, pas dans le code', () => {
    expect(prixPack('pack_30', IDS)).toBe('price_pack_30')
    expect(prixPack('pack_50', IDS)).toBe('price_pack_50')
  })

  it('porte l’identifiant du compte et le pack sur la session', () => {
    const m = metadonneesPack(COMPTE, 'pack_50')
    expect(m.user_id).toBe(COMPTE)
    expect(m.pack).toBe('pack_50')
    expect(m.jetons).toBe(String(PACKS.pack_50.jetons))
  })
})

describe('ce qu’un événement Stripe a le droit de créditer', () => {
  it('crédite un achat de pack payé, et le nombre de jetons vient de la table', () => {
    const c = creditDepuisSession(sessionPack())
    expect(c).toEqual({
      userId: COMPTE,
      pack: 'pack_30',
      jetons: PACKS.pack_30.jetons,
      source: 'pack_30',
      sessionId: 'cs_test_pack_30',
    })
  })

  it('ignore une métadonnée qui annonce un autre nombre de jetons', () => {
    // Une métadonnée se fabrique avec une clé d'écriture : le montant crédité se décide ici.
    const c = creditDepuisSession(
      sessionPack({ metadata: { ...metadonneesPack(COMPTE, 'pack_30'), jetons: '999999999' } }),
    )
    expect(c?.jetons).toBe(PACKS.pack_30.jetons)
  })

  it('refuse une session d’abonnement — ce n’est pas un achat de jetons', () => {
    expect(creditDepuisSession(sessionPack({ mode: 'subscription' }))).toBeNull()
    expect(creditDepuisSession(sessionPack({ mode: 'setup' }))).toBeNull()
    expect(creditDepuisSession(sessionPack({ mode: null }))).toBeNull()
  })

  it('refuse un paiement qui n’est pas encaissé', () => {
    expect(creditDepuisSession(sessionPack({ payment_status: 'unpaid' }))).toBeNull()
    expect(creditDepuisSession(sessionPack({ payment_status: 'no_payment_required' }))).toBeNull()
    expect(creditDepuisSession(sessionPack({ payment_status: null }))).toBeNull()
  })

  it('refuse un pack inconnu ou absent', () => {
    expect(creditDepuisSession(sessionPack({ metadata: { user_id: COMPTE, pack: 'pack_10' } }))).toBeNull()
    expect(creditDepuisSession(sessionPack({ metadata: { user_id: COMPTE } }))).toBeNull()
    expect(creditDepuisSession(sessionPack({ metadata: null }))).toBeNull()
    expect(creditDepuisSession(sessionPack({ metadata: {} }))).toBeNull()
  })

  it('refuse un compte qu’on n’identifie pas, ou qui se contredit', () => {
    expect(creditDepuisSession(sessionPack({ client_reference_id: null }))).toBeNull()
    expect(creditDepuisSession(sessionPack({ client_reference_id: 'pas-un-uuid' }))).toBeNull()
    expect(
      creditDepuisSession(sessionPack({ metadata: metadonneesPack('11111111-2222-3333-4444-555555555555', 'pack_30') })),
    ).toBeNull()
  })

  it('refuse une session sans identifiant : rien ne serait idempotent', () => {
    expect(creditDepuisSession(sessionPack({ id: null }))).toBeNull()
    expect(creditDepuisSession(null)).toBeNull()
    expect(creditDepuisSession(undefined)).toBeNull()
  })

  it('est idempotent : un événement rejoué porte la même clef, donc ne crédite pas deux fois', () => {
    const premier = creditDepuisSession(sessionPack())
    const rejoue = creditDepuisSession(sessionPack())
    expect(premier).not.toBeNull()
    expect(clefCredit(rejoue!)).toBe(clefCredit(premier!))
    expect(clefCredit(premier!)).toBe('cs_test_pack_30')
  })

  it('deux achats distincts restent deux crédits distincts', () => {
    const a = creditDepuisSession(sessionPack({ id: 'cs_test_a' }))
    const b = creditDepuisSession(sessionPack({ id: 'cs_test_b', metadata: metadonneesPack(COMPTE, 'pack_50') }))
    expect(clefCredit(a!)).not.toBe(clefCredit(b!))
    expect(b?.jetons).toBe(PACKS.pack_50.jetons)
  })
})
