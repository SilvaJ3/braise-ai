import { describe, expect, it } from 'vitest'
import { etapesDemarrage, type EtatDemarrage } from './demarrage-etapes'

const VIERGE: EtatDemarrage = {
  boutiques: 0,
  boutiqueUnique: null,
  produits: 0,
  bons: 0,
  idees: 0,
}

const cles = (etat: EtatDemarrage) => etapesDemarrage(etat).map((e) => e.cle)

describe('etapesDemarrage', () => {
  it('un compte neuf commence par la boutique et le catalogue', () => {
    expect(cles(VIERGE)).toEqual(['boutique', 'produits', 'planning'])
  })

  it('le premier bon attend une boutique ET des produits', () => {
    expect(cles({ ...VIERGE, boutiques: 1, boutiqueUnique: 'b1' })).not.toContain('bon')
    expect(cles({ ...VIERGE, produits: 4 })).not.toContain('bon')
    expect(cles({ ...VIERGE, boutiques: 1, boutiqueUnique: 'b1', produits: 4 })[0]).toBe('bon')
  })

  it('une étape faite disparaît', () => {
    expect(cles({ ...VIERGE, boutiques: 2 })).toEqual(['produits', 'planning'])
    expect(cles({ ...VIERGE, idees: 3 })).toEqual(['boutique', 'produits'])
    expect(cles({ ...VIERGE, boutiques: 1, boutiqueUnique: 'b1', produits: 2, bons: 1 })).toEqual([
      'planning',
    ])
  })

  it('jamais plus de trois lignes', () => {
    expect(etapesDemarrage(VIERGE)).toHaveLength(3)
    expect(etapesDemarrage(VIERGE, 1)).toHaveLength(1)
  })

  it('plus rien à proposer quand tout est fait', () => {
    expect(
      etapesDemarrage({ boutiques: 2, boutiqueUnique: null, produits: 3, bons: 1, idees: 2 }),
    ).toEqual([])
  })

  it('avec une seule boutique, le bon part directement de sa fiche', () => {
    const seul = etapesDemarrage({ ...VIERGE, boutiques: 1, boutiqueUnique: 'b1', produits: 3 })[0]
    expect(seul.vers).toBe('/boutiques/b1/depot')

    // Plusieurs boutiques : il faut choisir, donc on renvoie à la liste.
    const plusieurs = etapesDemarrage({ ...VIERGE, boutiques: 3, produits: 3 })[0]
    expect(plusieurs.vers).toBe('/boutiques')
  })

  it('« au moins un » suffit pour clore une étape — pas de catalogue complet exigé', () => {
    expect(cles({ ...VIERGE, produits: 1 })).toEqual(['boutique', 'planning'])
  })

  it("chaque étape mène quelque part d'utile et porte un titre", () => {
    for (const e of etapesDemarrage(VIERGE)) {
      expect(e.vers.startsWith('/')).toBe(true)
      expect(e.titre.length).toBeGreaterThan(0)
      expect(e.detail.length).toBeGreaterThan(0)
    }
  })
})
