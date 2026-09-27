import { describe, expect, it } from 'vitest'
import { nomNormalise, prixSaisi, produitDuCatalogue } from './marche-produit'

describe('prixSaisi', () => {
  it('accepte la virgule du clavier belge', () => {
    expect(prixSaisi('12,50')).toBe(12.5)
  })

  it('accepte le point', () => {
    expect(prixSaisi('12.50')).toBe(12.5)
  })

  it('accepte un entier, espaces compris', () => {
    expect(prixSaisi(' 18 ')).toBe(18)
  })

  it('arrondit au centime', () => {
    expect(prixSaisi('12,505')).toBe(12.51)
  })

  it('refuse le vide : on ne vend pas un article sans prix', () => {
    expect(prixSaisi('')).toBeNull()
    expect(prixSaisi('   ')).toBeNull()
  })

  it('refuse zéro et le négatif', () => {
    expect(prixSaisi('0')).toBeNull()
    expect(prixSaisi('-3')).toBeNull()
  })

  it("refuse ce qui n'est pas un nombre", () => {
    expect(prixSaisi('12 €')).toBeNull()
    expect(prixSaisi('douze')).toBeNull()
    expect(prixSaisi('1,2,3')).toBeNull()
  })
})

describe('nomNormalise', () => {
  it('ignore la casse et les espaces de trop', () => {
    expect(nomNormalise('  Bougie   Cèdre ')).toBe('bougie cèdre')
  })

  it('rend une clé vide sur un nom vide', () => {
    expect(nomNormalise('   ')).toBe('')
  })
})

describe('produitDuCatalogue', () => {
  const produits = [
    { id: 'p1', nom: 'Bougie cèdre' },
    { id: 'p2', nom: 'Savon lait de chèvre' },
  ]

  it('retrouve le produit sous une autre casse', () => {
    expect(produitDuCatalogue(produits, 'BOUGIE CÈDRE')?.id).toBe('p1')
  })

  it('retrouve le produit malgré les espaces', () => {
    expect(produitDuCatalogue(produits, ' bougie  cèdre ')?.id).toBe('p1')
  })

  it("ne rapproche pas deux noms différents — c'est un nouveau produit", () => {
    expect(produitDuCatalogue(produits, 'Bougie ambre')).toBeUndefined()
  })

  it("ne rapproche rien sur un nom vide", () => {
    expect(produitDuCatalogue(produits, '   ')).toBeUndefined()
  })
})
