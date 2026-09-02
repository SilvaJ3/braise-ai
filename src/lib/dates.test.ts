import { describe, expect, it } from 'vitest'
import { joursDepuis, ymd } from './dates'

describe('dates', () => {
  it('ymd utilise la date locale', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(ymd(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
  it('joursDepuis compte en jours entiers', () => {
    const now = new Date(2026, 8, 2, 12).getTime()
    expect(joursDepuis('2026-09-02', now)).toBe(0)
    expect(joursDepuis('2026-08-12', now)).toBe(21)
  })
})
