import { describe, expect, it } from 'vitest'
import {
  CONSOMMATION_VIDE,
  consommation,
  coutConsommation,
  coutEstimeEur,
  cumuler,
  economieCache,
  ligneUsage,
  messageQuotaAtteint,
  PLANS,
  planValide,
  quotaImports,
  quotaQuestions,
} from './compte'

describe('plans', () => {
  it('n’utilise que des plans connus, et retombe sur l’essai sinon', () => {
    expect(planValide('fondateur')).toBe('fondateur')
    expect(planValide('gratuit')).toBe('essai')
    expect(planValide(null)).toBe('essai')
    expect(planValide(42)).toBe('essai')
  })

  it('donne à l’essai moins de marge qu’à un plan payant, mais de quoi juger', () => {
    expect(PLANS.essai.questions).toBeGreaterThan(20)
    expect(PLANS.essai.questions).toBeLessThan(PLANS.mensuel.questions)
    expect(PLANS.mensuel.questions).toBe(PLANS.annuel.questions)
  })
})

describe('quotas effectifs', () => {
  it('suit le plan quand le compte n’a pas de dérogation', () => {
    expect(quotaQuestions('mensuel', null)).toBe(PLANS.mensuel.questions)
    expect(quotaQuestions('essai')).toBe(PLANS.essai.questions)
    expect(quotaImports('fondateur', undefined)).toBe(PLANS.fondateur.imports)
  })

  it('honore une dérogation positive', () => {
    expect(quotaQuestions('essai', 500)).toBe(500)
    expect(quotaImports('fondateur', 50)).toBe(50)
  })

  it('ignore une dérogation absurde plutôt que de tout ouvrir', () => {
    // 0 ou négatif = pas de dérogation : mieux vaut le quota du plan qu'un quota nul (qui
    // bloquerait tout) ou qu'un plafond ouvert par accident.
    expect(quotaQuestions('mensuel', 0)).toBe(PLANS.mensuel.questions)
    expect(quotaQuestions('mensuel', -5)).toBe(PLANS.mensuel.questions)
  })
})

describe('coutEstimeEur', () => {
  it('chiffre un usage sur la grille du modèle', () => {
    // 1 M de tokens en entrée ($2) et 1 M en sortie ($10) = $12, à 0,92 €/$
    expect(coutEstimeEur(1_000_000, 1_000_000)).toBeCloseTo(11.04, 3)
  })

  it('reste proportionnel sur un usage réel', () => {
    const petit = coutEstimeEur(3_000, 800)
    expect(petit).toBeGreaterThan(0.01)
    expect(petit).toBeLessThan(0.02)
  })

  it('ne rend jamais un coût négatif ni NaN', () => {
    expect(coutEstimeEur(0, 0)).toBe(0)
    expect(coutEstimeEur(-100, -100)).toBe(0)
    expect(Number.isFinite(coutEstimeEur(Number.NaN, 10))).toBe(true)
  })
})

describe('messageQuotaAtteint', () => {
  it('dit le quota, la raison et quand ça se recharge', () => {
    const questions = messageQuotaAtteint('questions', 150)
    expect(questions).toContain('150')
    expect(questions).toContain('1er du mois prochain')
    const imports = messageQuotaAtteint('imports', 20)
    expect(imports).toContain('20')
    expect(imports).toMatch(/import/)
  })

  it('accorde le message au singulier quand le quota vaut 1', () => {
    expect(messageQuotaAtteint('questions', 1)).toContain('ta question du mois')
    expect(messageQuotaAtteint('imports', 1)).toContain('ton import du mois')
  })
})

describe('consommation', () => {
  it('lit un usage réel, cache et recherches web compris', () => {
    const c = consommation({
      input_tokens: 1200,
      output_tokens: 415,
      cache_creation_input_tokens: 5800,
      cache_read_input_tokens: 42_000,
      server_tool_use: { web_search_requests: 2 },
    })
    expect(c).toEqual({
      appels: 1,
      input_tokens: 1200,
      output_tokens: 415,
      cache_write_tokens: 5800,
      cache_read_tokens: 42_000,
      recherches_web: 2,
    })
  })

  it('compte zéro sur un usage absent ou partiel, jamais NaN', () => {
    expect(consommation(undefined)).toEqual({ ...CONSOMMATION_VIDE, appels: 1 })
    expect(consommation({ input_tokens: 10 })).toEqual({
      ...CONSOMMATION_VIDE,
      appels: 1,
      input_tokens: 10,
    })
    expect(consommation({ input_tokens: -3, server_tool_use: null })).toEqual({
      ...CONSOMMATION_VIDE,
      appels: 1,
    })
  })

  it('cumule les appels d’un même tour de chat', () => {
    const un = consommation({ input_tokens: 100, cache_read_input_tokens: 900 })
    const deux = consommation({ input_tokens: 150, output_tokens: 60, server_tool_use: { web_search_requests: 1 } })
    const total = cumuler(un, deux)
    expect(total.appels).toBe(2)
    expect(total.input_tokens).toBe(250)
    expect(total.output_tokens).toBe(60)
    expect(total.cache_read_tokens).toBe(900)
    expect(total.recherches_web).toBe(1)
  })
})

describe('coût avec cache', () => {
  it('facture la relecture de cache au dixième du tarif d’entrée, pas au tarif plein', () => {
    // 1 M de jetons relus : 0,20 $ au lieu de 2 $, soit 0,184 € au lieu de 1,84 €.
    expect(coutEstimeEur(0, 0, 1_000_000)).toBeCloseTo(0.184, 3)
    expect(economieCache({ ...CONSOMMATION_VIDE, cache_read_tokens: 1_000_000 })).toBeCloseTo(1.656, 3)
  })

  it('facture l’écriture de cache plus cher que l’entrée (1,25x)', () => {
    expect(coutEstimeEur(0, 0, 0, 1_000_000)).toBeCloseTo(2.3, 3)
  })

  it('chiffre une ligne de journal complète', () => {
    const c = consommation({
      input_tokens: 1200,
      output_tokens: 415,
      cache_creation_input_tokens: 5800,
      cache_read_input_tokens: 42_000,
    })
    expect(coutConsommation(c)).toBeGreaterThan(0)
    expect(economieCache(c)).toBeGreaterThan(coutConsommation(c))
  })

  it('n’invente pas d’économie sans relecture', () => {
    expect(economieCache(CONSOMMATION_VIDE)).toBe(0)
  })
})

describe('ligneUsage', () => {
  it('porte tous les postes de la consommation, bornés et entiers', () => {
    const ligne = ligneUsage(
      'u1',
      'assistant',
      'claude-sonnet-5',
      consommation({
        input_tokens: 1200.4,
        output_tokens: 415,
        cache_creation_input_tokens: 5800,
        cache_read_input_tokens: 42_000,
        server_tool_use: { web_search_requests: 2 },
      }),
    )
    expect(ligne).toMatchObject({
      user_id: 'u1',
      fonction: 'assistant',
      modele: 'claude-sonnet-5',
      appels: 1,
      input_tokens: 1200,
      output_tokens: 415,
      cache_write_tokens: 5800,
      cache_read_tokens: 42_000,
      recherches_web: 2,
    })
  })

  it('compte au moins un appel, même sur une consommation vide', () => {
    expect(ligneUsage('u1', 'bilan', 'm', CONSOMMATION_VIDE).appels).toBe(1)
  })
})
