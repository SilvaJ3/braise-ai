import { describe, expect, it } from 'vitest'
import {
  ESSAI_JOURS,
  abonnementOuvreAcces,
  accesAutorise,
  essaiEnCours,
  joursEssaiRestants,
  messageEssaiTermine,
} from './essai.ts'

const MAINTENANT = new Date('2026-10-01T10:00:00.000Z')
/** Un essai qui finit dans `jours` jours, écrit comme la base l'écrit (ISO). */
const finDans = (jours: number) => new Date(MAINTENANT.getTime() + jours * 86_400_000).toISOString()

describe('essaiEnCours', () => {
  it('un essai qui finit plus tard est en cours', () => {
    expect(essaiEnCours(finDans(1), MAINTENANT)).toBe(true)
    expect(essaiEnCours(finDans(0.5), MAINTENANT)).toBe(true)
  })

  it('un essai échu ne l’est plus, à la seconde près', () => {
    expect(essaiEnCours(finDans(0), MAINTENANT)).toBe(false)
    expect(essaiEnCours(finDans(-1), MAINTENANT)).toBe(false)
  })

  it('une date absente ou illisible n’est pas un essai en cours', () => {
    for (const v of [null, undefined, '', 'hier', 'n/a']) {
      expect(essaiEnCours(v, MAINTENANT)).toBe(false)
    }
  })
})

describe('joursEssaiRestants', () => {
  it('arrondit au jour supérieur : un jour entamé compte pour un jour', () => {
    expect(joursEssaiRestants(finDans(2), MAINTENANT)).toBe(2)
    expect(joursEssaiRestants(finDans(1.2), MAINTENANT)).toBe(2)
    expect(joursEssaiRestants(finDans(0.1), MAINTENANT)).toBe(1)
  })

  it('zéro quand l’essai est fini, ou quand la date manque', () => {
    expect(joursEssaiRestants(finDans(-2), MAINTENANT)).toBe(0)
    expect(joursEssaiRestants(null, MAINTENANT)).toBe(0)
  })
})

describe('abonnementOuvreAcces', () => {
  it('un abonnement actif ou en retard ouvre l’accès', () => {
    expect(abonnementOuvreAcces('actif')).toBe(true)
    // Un prélèvement échoué est un problème de carte, pas une raison de fermer l'outil.
    expect(abonnementOuvreAcces('en_retard')).toBe(true)
  })

  it('un abonnement terminé ou jamais pris ne l’ouvre pas', () => {
    for (const v of ['aucun', 'resilie', '', null, undefined, 'ACTIF', 'active']) {
      expect(abonnementOuvreAcces(v)).toBe(false)
    }
  })
})

describe('accesAutorise', () => {
  it('pendant l’essai, le compte travaille', () => {
    expect(accesAutorise({ essai_fin: finDans(3), abonnement_statut: 'aucun' }, MAINTENANT)).toBe(true)
  })

  it('essai fini et rien payé : l’accès est fermé', () => {
    expect(accesAutorise({ essai_fin: finDans(-1), abonnement_statut: 'aucun' }, MAINTENANT)).toBe(false)
  })

  it('un abonnement actif rouvre l’accès après l’essai', () => {
    expect(accesAutorise({ essai_fin: finDans(-30), abonnement_statut: 'actif' }, MAINTENANT)).toBe(true)
  })

  it('un compte de test passe toujours, même essai fini', () => {
    expect(
      accesAutorise({ essai_fin: finDans(-30), abonnement_statut: 'aucun', est_test: true }, MAINTENANT),
    ).toBe(true)
  })

  it('une date d’essai absente ou illisible laisse passer (base en retard sur le code)', () => {
    for (const v of [null, undefined, '', 'pas une date']) {
      expect(accesAutorise({ essai_fin: v }, MAINTENANT)).toBe(true)
    }
  })
})

describe('messageEssaiTermine', () => {
  it('dit la durée, ce qui s’arrête, ce qui reste, et où repartir', () => {
    const m = messageEssaiTermine()
    expect(m).toContain(`${ESSAI_JOURS} jours`)
    expect(m).toContain('assistant')
    expect(m).toContain('toujours là')
    expect(m).toContain('Mon compte')
  })
})
