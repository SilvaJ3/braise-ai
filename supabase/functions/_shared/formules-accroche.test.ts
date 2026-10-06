import { describe, expect, it } from 'vitest'
import { catalogueEnTexte, FORMULES_ACCROCHE, NOMS_FORMULES } from './formules-accroche'

describe('catalogue des formules d’accroche', () => {
  it('compte 12 formules aux noms uniques', () => {
    expect(FORMULES_ACCROCHE).toHaveLength(12)
    expect(new Set(NOMS_FORMULES).size).toBe(12)
  })

  it('porte pour chaque formule un gabarit, un exemple, une version écran et « comment ça se rate »', () => {
    for (const f of FORMULES_ACCROCHE) {
      expect(f.nom.trim(), f.nom).not.toBe('')
      expect(f.gabarit, f.nom).toMatch(/\{[^}]+\}/)
      expect(f.exemple.metier.trim(), f.nom).not.toBe('')
      expect(f.exemple.texte.trim(), f.nom).not.toBe('')
      expect(f.commentCaSeRate.trim().length, f.nom).toBeGreaterThan(40)
    }
  })

  it('tient la version écran à 6 mots ou moins', () => {
    for (const f of FORMULES_ACCROCHE) {
      expect(f.ecran.trim().split(/\s+/).length, f.nom).toBeLessThanOrEqual(6)
    }
  })

  it('couvre le signal haut comme le signal bas', () => {
    expect(FORMULES_ACCROCHE.some((f) => f.signal === 'haut')).toBe(true)
    expect(FORMULES_ACCROCHE.some((f) => f.signal === 'bas')).toBe(true)
  })

  it('ne contient aucun tiret cadratin (le catalogue passe son propre filtre)', () => {
    expect(JSON.stringify(FORMULES_ACCROCHE)).not.toMatch(/[—–]/)
    expect(catalogueEnTexte()).not.toMatch(/[—–]/)
  })
})
