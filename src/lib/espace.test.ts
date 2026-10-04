import { describe, expect, it } from 'vitest'
import { estEspaceBoutique } from './espace'

describe('estEspaceBoutique', () => {
  it('vrai sur l’hôte de la boutique, quelle que soit la casse', () => {
    expect(estEspaceBoutique('boutique.braaise.io')).toBe(true)
    expect(estEspaceBoutique(' Boutique.Braaise.IO ')).toBe(true)
  })
  it('faux sur l’application de l’artisan et en local', () => {
    expect(estEspaceBoutique('artisan.braaise.io')).toBe(false)
    expect(estEspaceBoutique('localhost')).toBe(false)
    expect(estEspaceBoutique('boutique.braaise.io.evil.example')).toBe(false)
  })
  it('l’aperçu ?espace=boutique marche partout, et rien d’autre ne l’imite', () => {
    expect(estEspaceBoutique('artisan.braaise.io', '?espace=boutique')).toBe(true)
    expect(estEspaceBoutique('artisan.braaise.io', '?espace=artisan')).toBe(false)
    expect(estEspaceBoutique('artisan.braaise.io', '?x=espace=boutique')).toBe(false)
  })
})
