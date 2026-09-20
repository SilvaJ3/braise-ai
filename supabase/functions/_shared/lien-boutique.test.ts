import { describe, expect, it } from 'vitest'
import { baseLienBoutique, lienBoutique } from './lien-boutique'

const JETON = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0'

describe('lienBoutique', () => {
  it('met le jeton dans le chemin, sur l’adresse définitive (celle de l’écran aussi)', () => {
    // La même chaîne est affirmée côté écran (`src/lib/boutique-etat.test.ts`) : une seule adresse.
    expect(lienBoutique('https://www.braaise.io', JETON)).toBe(
      `https://www.braaise.io/boutique/${JETON}`,
    )
  })

  it('tolère une barre finale, des espaces, et deux barres', () => {
    expect(lienBoutique('https://exemple.be/', JETON)).toBe(`https://exemple.be/boutique/${JETON}`)
    expect(lienBoutique('https://exemple.be//', JETON)).toBe(`https://exemple.be/boutique/${JETON}`)
    expect(lienBoutique('  https://exemple.be  ', JETON)).toBe(`https://exemple.be/boutique/${JETON}`)
  })

  it('encode le jeton : un lien ne se casse pas sur un caractère inattendu', () => {
    expect(lienBoutique('https://exemple.be', 'a b&c')).toBe('https://exemple.be/boutique/a%20b%26c')
  })

  it('ne rend pas d’adresse bancale quand il n’y a pas de jeton', () => {
    expect(lienBoutique('https://exemple.be', '')).toBe('')
  })
})

describe('baseLienBoutique', () => {
  it('garde une adresse complète, sans barre finale', () => {
    expect(baseLienBoutique('https://braaise.io/')).toBe('https://braaise.io')
    expect(baseLienBoutique(' https://braise-ai.vercel.app ')).toBe('https://braise-ai.vercel.app')
  })

  it('rend une chaîne vide plutôt qu’un lien qui ne mène nulle part', () => {
    expect(baseLienBoutique('')).toBe('')
    expect(baseLienBoutique(null)).toBe('')
    expect(baseLienBoutique(undefined)).toBe('')
    expect(baseLienBoutique('braaise.io')).toBe('')
    expect(baseLienBoutique('/boutique')).toBe('')
  })
})
