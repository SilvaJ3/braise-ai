import { describe, expect, it } from 'vitest'
import { DEFAULT_COLORS, sanitizeColors } from './theme'

describe('sanitizeColors', () => {
  it('accepte des hex valides', () => {
    expect(sanitizeColors({ primary: '#ABCDEF', secondary: '#000000' })).toEqual({ primary: '#abcdef', secondary: '#000000' })
  })
  it('retombe sur le défaut pour tout le reste', () => {
    expect(sanitizeColors({ primary: 'red; background:url(x)', secondary: 42 })).toEqual(DEFAULT_COLORS)
    expect(sanitizeColors('garbage')).toEqual(DEFAULT_COLORS)
    expect(sanitizeColors(null)).toEqual(DEFAULT_COLORS)
  })
})
