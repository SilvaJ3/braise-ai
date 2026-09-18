import { describe, expect, it } from 'vitest'
import { systemEnBlocs } from './anthropic'

describe('systemEnBlocs', () => {
  it('place la marque de cache sur le dernier bloc stable, et sur lui seul', () => {
    const blocs = systemEnBlocs(['consignes', 'contexte stable'], ['contexte variable'])
    expect(blocs).toHaveLength(3)
    expect(blocs[0].cache_control).toBeUndefined()
    expect(blocs[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(blocs[2].cache_control).toBeUndefined()
  })

  it('garde l’ordre : le stable d’abord, le variable ensuite', () => {
    const blocs = systemEnBlocs(['A', 'B'], ['C', 'D'])
    expect(blocs.map((b) => b.text)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('ne marque rien quand il n’y a aucun bloc stable', () => {
    const blocs = systemEnBlocs([], ['variable'])
    expect(blocs).toHaveLength(1)
    expect(blocs[0].cache_control).toBeUndefined()
  })

  it('écarte les blocs vides : un blanc casserait la comparaison de préfixe', () => {
    const blocs = systemEnBlocs(['consignes', '   '], ['', '\n'])
    expect(blocs).toHaveLength(1)
    expect(blocs[0].text).toBe('consignes')
    expect(blocs[0].cache_control).toEqual({ type: 'ephemeral' })
  })
})
