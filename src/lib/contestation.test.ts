import { describe, expect, it } from 'vitest'
import {
  DELAI_CONTESTATION_JOURS,
  joursDepuisDepot,
  libelleTardif,
  limiteContestation,
  phraseDelai,
  signalementTardif,
} from './contestation'

describe('délai de contestation', () => {
  it('est de 3 jours (décision du 04/10)', () => {
    expect(DELAI_CONTESTATION_JOURS).toBe(3)
  })

  it('compte les jours calendaires depuis le dépôt (jour 0 = le jour même)', () => {
    expect(joursDepuisDepot('2026-10-01', '2026-10-01T23:59:00Z')).toBe(0)
    expect(joursDepuisDepot('2026-10-01', '2026-10-04T00:01:00Z')).toBe(3)
    expect(joursDepuisDepot('2026-09-28', new Date('2026-10-04T10:00:00Z'))).toBe(6)
  })

  it('une date illisible ne donne pas de nombre', () => {
    expect(joursDepuisDepot(null, '2026-10-04')).toBeNull()
    expect(joursDepuisDepot('bientôt', '2026-10-04')).toBeNull()
    expect(joursDepuisDepot('2026-10-01', '')).toBeNull()
  })

  it('la limite est le jour 3, passage de mois compris', () => {
    expect(limiteContestation('2026-10-01')).toBe('04/10/2026')
    expect(limiteContestation('2026-10-30')).toBe('02/11/2026')
    expect(limiteContestation(null)).toBeNull()
  })
})

describe('phraseDelai', () => {
  const depot = '2026-10-01'
  it('dans le délai : la date limite, jour 3 inclus', () => {
    expect(phraseDelai(depot, new Date('2026-10-02T10:00:00Z'))).toContain('avant le 04/10/2026')
    expect(phraseDelai(depot, new Date('2026-10-04T10:00:00Z'))).toContain('avant le 04/10/2026')
  })
  it('après le délai : on peut encore signaler, et la phrase dit « tardif »', () => {
    const p = phraseDelai(depot, new Date('2026-10-05T10:00:00Z'))
    expect(p).toContain('est passé')
    expect(p).toContain('encore signaler')
    expect(p).toContain('tardif')
  })
  it('sans date de dépôt lisible : la règle générale, sans date inventée', () => {
    expect(phraseDelai(null)).toBe('Signale tout écart dans les 3 jours qui suivent le dépôt.')
  })
})

describe('signalement tardif', () => {
  it('jusqu’au jour 3 inclus : dans les temps', () => {
    expect(signalementTardif('2026-10-01', '2026-10-04T08:00:00Z')).toEqual({ tardif: false, jours: 3 })
    expect(libelleTardif('2026-10-01', '2026-10-04T08:00:00Z')).toBeNull()
  })
  it('au jour 4 et après : tardif, avec le nombre de jours', () => {
    expect(signalementTardif('2026-10-01', '2026-10-05T08:00:00Z')).toEqual({ tardif: true, jours: 4 })
    expect(libelleTardif('2026-09-24', '2026-10-03T08:00:00Z')).toBe('Tardif : signalé 9 jours après le dépôt')
  })
  it('on ne marque jamais « tardif » sur une date illisible', () => {
    expect(signalementTardif(null, '2026-10-05')).toBeNull()
    expect(libelleTardif('2026-10-01', null)).toBeNull()
  })
})
