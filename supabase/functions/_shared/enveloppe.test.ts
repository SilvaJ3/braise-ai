import { describe, expect, it } from 'vitest'
import { consommation, PRIX_USD_PAR_MTOK } from './compte.ts'
import {
  champsEnveloppe,
  ENVELOPPE_JETONS,
  enveloppeDisponible,
  enveloppeJetons,
  jetonsEquivalents,
  JETONS_PAR_QUESTION,
  messageEnveloppeEpuisee,
  plafondJetons,
  POIDS_JETON,
  questionsIndicatives,
  RESERVE_JETONS,
  soldeJetons,
} from './enveloppe.ts'

describe('la pondération des jetons', () => {
  it('sort du tarif du fournisseur, jamais d’un nombre écrit à la main', () => {
    expect(POIDS_JETON.input).toBe(1)
    expect(POIDS_JETON.output).toBe(PRIX_USD_PAR_MTOK.output / PRIX_USD_PAR_MTOK.input)
    expect(POIDS_JETON.output).toBe(5)
    expect(POIDS_JETON.cacheRead).toBe(0.1)
    expect(POIDS_JETON.cacheWrite).toBe(1.25)
  })

  it('compte un usage réel dans la même unité pour les quatre postes', () => {
    const c = consommation({
      input_tokens: 1_000,
      output_tokens: 100,
      cache_read_input_tokens: 10_000,
      cache_creation_input_tokens: 1_000,
    })
    // 1 000 + 100x5 + 10 000x0,1 + 1 000x1,25 = 1 000 + 500 + 1 000 + 1 250
    expect(jetonsEquivalents(c)).toBe(3_750)
  })

  it('ne compte pas les recherches web : elles se facturent à la pièce, hors tarif par million', () => {
    const avec = consommation({ input_tokens: 10, server_tool_use: { web_search_requests: 3 } })
    const sans = consommation({ input_tokens: 10 })
    expect(jetonsEquivalents(avec)).toBe(jetonsEquivalents(sans))
  })

  it('rend un entier, jamais zéro sur du vide, jamais NaN sur de l’absurde', () => {
    expect(jetonsEquivalents(consommation(undefined))).toBe(0)
    expect(jetonsEquivalents(consommation({ input_tokens: -50, output_tokens: -3 }))).toBe(0)
    expect(Number.isFinite(jetonsEquivalents(consommation({ output_tokens: 0.6 })))).toBe(true)
  })
})

describe('l’enveloppe par plan', () => {
  it('donne la même enveloppe aux trois formules payantes', () => {
    expect(enveloppeJetons('fondateur')).toBe(ENVELOPPE_JETONS.fondateur)
    expect(enveloppeJetons('mensuel')).toBe(ENVELOPPE_JETONS.fondateur)
    expect(enveloppeJetons('annuel')).toBe(ENVELOPPE_JETONS.fondateur)
  })

  it('donne à l’essai la même enveloppe qu’un abonnement : c’est le DÉLAI qui distingue l’essai', () => {
    expect(enveloppeJetons('essai')).toBeGreaterThan(0)
    expect(enveloppeJetons('essai')).toBe(enveloppeJetons('mensuel'))
  })

  it('retombe sur l’essai pour un plan inconnu ou absent', () => {
    expect(enveloppeJetons('gratuit')).toBe(ENVELOPPE_JETONS.essai)
    expect(enveloppeJetons(null)).toBe(ENVELOPPE_JETONS.essai)
    expect(enveloppeJetons(42)).toBe(ENVELOPPE_JETONS.essai)
  })

  it('ajoute les jetons achetés au plafond du mois', () => {
    expect(plafondJetons('mensuel')).toBe(ENVELOPPE_JETONS.mensuel)
    expect(plafondJetons('mensuel', 3_000_000)).toBe(ENVELOPPE_JETONS.mensuel + 3_000_000)
    expect(plafondJetons('mensuel', -10)).toBe(ENVELOPPE_JETONS.mensuel)
  })

  it('traduit en questions pour l’écran, en ordre de grandeur', () => {
    expect(JETONS_PAR_QUESTION).toBe(5_000)
    expect(questionsIndicatives(ENVELOPPE_JETONS.mensuel)).toBe(300)
    expect(questionsIndicatives(0)).toBe(0)
    expect(questionsIndicatives(Number.NaN)).toBe(0)
  })
})

describe('le solde du mois', () => {
  it('consomme l’enveloppe AVANT les jetons achetés', () => {
    const s = soldeJetons('mensuel', 100_000, 3_000_000)
    expect(s.restantEnveloppe).toBe(ENVELOPPE_JETONS.mensuel - 100_000)
    expect(s.restantCredits).toBe(3_000_000)
    expect(s.restant).toBe(s.restantEnveloppe + s.restantCredits)
    expect(s.epuise).toBe(false)
  })

  it('n’entame les jetons achetés qu’une fois l’enveloppe du mois utilisée', () => {
    const s = soldeJetons('mensuel', ENVELOPPE_JETONS.mensuel + 1_000, 3_000_000)
    expect(s.restantEnveloppe).toBe(0)
    expect(s.restantCredits).toBe(2_999_000)
    expect(s.restant).toBe(2_999_000)
  })

  it('dit épuisé quand il n’y a plus rien, enveloppe et crédits confondus', () => {
    expect(soldeJetons('essai', ENVELOPPE_JETONS.essai).epuise).toBe(true)
    expect(soldeJetons('essai', ENVELOPPE_JETONS.essai - 1).epuise).toBe(false)
    expect(soldeJetons('essai', ENVELOPPE_JETONS.essai, 5_000).epuise).toBe(false)
    expect(soldeJetons('essai', ENVELOPPE_JETONS.essai + 5_000, 5_000).epuise).toBe(true)
  })

  it('ne descend jamais sous zéro, même avec un compteur incohérent', () => {
    const s = soldeJetons('mensuel', 99_000_000, 0)
    expect(s.restant).toBe(0)
    expect(s.restantEnveloppe).toBe(0)
    expect(s.restantCredits).toBe(0)
    expect(soldeJetons('mensuel', -5, -5).restant).toBe(ENVELOPPE_JETONS.mensuel)
  })
})

describe('la règle que la base applique', () => {
  it('accepte un tour qui tient, refuse celui qui dépasse', () => {
    const reserve = RESERVE_JETONS.assistant
    expect(enveloppeDisponible('essai', 0, 0, reserve)).toBe(true)
    expect(enveloppeDisponible('essai', ENVELOPPE_JETONS.essai - reserve, 0, reserve)).toBe(true)
    expect(enveloppeDisponible('essai', ENVELOPPE_JETONS.essai - reserve + 1, 0, reserve)).toBe(false)
  })

  it('tient compte des jetons achetés', () => {
    expect(enveloppeDisponible('essai', ENVELOPPE_JETONS.essai, 100_000, RESERVE_JETONS.assistant)).toBe(true)
    expect(enveloppeDisponible('essai', ENVELOPPE_JETONS.essai + 100_000, 100_000, 1)).toBe(false)
  })

  it('réserve le plafond de sortie d’un import, pas une question', () => {
    expect(RESERVE_JETONS.import).toBeGreaterThan(RESERVE_JETONS.assistant)
    expect(RESERVE_JETONS.import).toBe(16_000 * POIDS_JETON.output)
  })
})

describe('le message d’un plafond épuisé', () => {
  it('dit l’ordre de grandeur, quand ça se recharge, et par où continuer', () => {
    const m = messageEnveloppeEpuisee(ENVELOPPE_JETONS.mensuel)
    expect(m).toContain('environ 300 questions')
    expect(m).toContain('1er du mois prochain')
    expect(m).toContain('pack')
  })

  it('ne propose pas de pack quand il n’y en a pas', () => {
    const m = messageEnveloppeEpuisee(ENVELOPPE_JETONS.essai, false)
    expect(m).not.toContain('pack')
    expect(m).toContain('1er du mois prochain')
  })

  it('reste lisible sur un plafond minuscule', () => {
    expect(messageEnveloppeEpuisee(0)).toContain('ce qu’il contenait')
    expect(messageEnveloppeEpuisee(Number.NaN)).toContain('1er du mois prochain')
  })
})

describe('les chiffres de l’enveloppe lus de la base', () => {
  it('rend les deux compteurs quand la base les connaît', () => {
    expect(champsEnveloppe({ jetons_consommes: 12_000, credits_jetons: 3_000_000 })).toEqual({
      consommes: 12_000,
      credits: 3_000_000,
    })
  })

  it('accepte un bigint rendu en chaîne', () => {
    expect(champsEnveloppe({ jetons_consommes: '12000', credits_jetons: '3000000' })).toEqual({
      consommes: 12_000,
      credits: 3_000_000,
    })
  })

  it('rend null quand la base ne les connaît pas encore — le repli est explicite', () => {
    expect(champsEnveloppe(undefined)).toBeNull()
    expect(champsEnveloppe(null)).toBeNull()
    expect(champsEnveloppe({})).toBeNull()
    expect(champsEnveloppe({ jetons_consommes: null })).toBeNull()
    expect(champsEnveloppe({ jetons_consommes: 'beaucoup' })).toBeNull()
    expect(champsEnveloppe('12000')).toBeNull()
  })

  it('compte zéro crédit plutôt que NaN quand la colonne manque', () => {
    expect(champsEnveloppe({ jetons_consommes: 5 })).toEqual({ consommes: 5, credits: 0 })
    expect(champsEnveloppe({ jetons_consommes: 5, credits_jetons: null })).toEqual({ consommes: 5, credits: 0 })
  })
})
