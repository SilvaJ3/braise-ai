import { describe, expect, it } from 'vitest'
import {
  coutEstimeEur,
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
