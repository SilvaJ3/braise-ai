import { describe, expect, it } from 'vitest'
import { baseLienBoutique, lienBoutique } from './lien-boutique'

const JETON = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0'

describe('lienBoutique', () => {
  it('colle le jeton sur le chemin de la page, jamais en dur', () => {
    expect(lienBoutique('https://braise-ai.vercel.app', JETON)).toBe(
      `https://braise-ai.vercel.app/boutique/?t=${JETON}`,
    )
  })

  it('tolère une barre finale, des espaces, et deux barres', () => {
    expect(lienBoutique('https://exemple.be/', JETON)).toBe(`https://exemple.be/boutique/?t=${JETON}`)
    expect(lienBoutique('https://exemple.be//', JETON)).toBe(`https://exemple.be/boutique/?t=${JETON}`)
    expect(lienBoutique('  https://exemple.be  ', JETON)).toBe(`https://exemple.be/boutique/?t=${JETON}`)
  })

  it('encode le jeton : un lien ne se casse pas sur un caractère inattendu', () => {
    expect(lienBoutique('https://exemple.be', 'a b&c')).toBe('https://exemple.be/boutique/?t=a%20b%26c')
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
