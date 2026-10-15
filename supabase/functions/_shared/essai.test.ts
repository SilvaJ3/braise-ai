import { describe, expect, it } from 'vitest'
import {
  ESSAI_JOURS,
  abonnementOuvreAcces,
  accesAutorise,
  essaiEnCours,
  essaiPourCheckout,
  joursEssaiRestants,
  messageAccesRefuse,
  messageEssaiPasCommence,
  messageEssaiTermine,
  messageImpaye,
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

  it('un compte de démonstration passe aussi, et il est distinct du compte de test (02/10)', () => {
    expect(
      accesAutorise({ essai_fin: finDans(-30), abonnement_statut: 'aucun', demo: true }, MAINTENANT),
    ).toBe(true)
    // Le drapeau ne se devine pas : une valeur approchante ne l'ouvre pas.
    expect(
      accesAutorise({ essai_fin: finDans(-30), abonnement_statut: 'aucun', demo: false }, MAINTENANT),
    ).toBe(false)
  })

  it('un accès offert ouvre la porte, même essai fini (0076)', () => {
    expect(
      accesAutorise({ essai_fin: finDans(-30), abonnement_statut: 'aucun', acces_gratuit: true }, MAINTENANT),
    ).toBe(true)
    // Et il ne suffit pas d'une valeur approchante : seul `true` ouvre.
    expect(
      accesAutorise({ essai_fin: finDans(-30), abonnement_statut: 'aucun', acces_gratuit: false }, MAINTENANT),
    ).toBe(false)
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

describe('un compte neuf, essai pas commencé (0091)', () => {
  it('travaille : pas de date d’essai, pas de porte', () => {
    expect(accesAutorise({ essai_fin: null, abonnement_statut: 'aucun' }, MAINTENANT)).toBe(true)
  })

  it('un essai commencé puis terminé, sans paiement, ferme la porte', () => {
    expect(accesAutorise({ essai_fin: finDans(-1), abonnement_statut: 'aucun' }, MAINTENANT)).toBe(false)
  })

  it('la phrase de l’essai pas commencé dit quoi faire et qu’il n’y a rien à régler', () => {
    const m = messageEssaiPasCommence()
    expect(m).toContain(`${ESSAI_JOURS} jours`)
    expect(m).toContain('première action')
    expect(m).toContain('Rien à régler avant')
  })
})

describe('messageAccesRefuse', () => {
  it('dit l’impayé quand la porte est fermée après relances', () => {
    expect(messageAccesRefuse({ acces_ferme_le: '2026-10-01T00:00:00.000Z' })).toBe(messageImpaye())
  })

  it('dit l’essai terminé sinon, même sans abonnement : l’essai a bien commencé', () => {
    expect(messageAccesRefuse({ essai_fin: finDans(-1), abonnement_statut: 'aucun' })).toBe(messageEssaiTermine())
  })
})

describe('essaiPourCheckout', () => {
  it('un compte qui a déjà eu un abonnement paie tout de suite', () => {
    expect(essaiPourCheckout(finDans(5), true, MAINTENANT)).toBeNull()
    expect(essaiPourCheckout(null, true, MAINTENANT)).toBeNull()
  })

  it('essai pas commencé : sept jours, ouverts avec la carte', () => {
    expect(essaiPourCheckout(null, false, MAINTENANT)).toEqual({ trial_period_days: ESSAI_JOURS })
    expect(essaiPourCheckout(undefined, false, MAINTENANT)).toEqual({ trial_period_days: ESSAI_JOURS })
  })

  it('essai en cours avec de la marge : la carte le poursuit jusqu’à sa date, sans en rouvrir un', () => {
    const fin = finDans(4)
    expect(essaiPourCheckout(fin, false, MAINTENANT)).toEqual({ trial_end: Math.floor(new Date(fin).getTime() / 1000) })
  })

  it('essai bientôt fini (moins de 49 h) ou terminé : paiement immédiat, jamais un second essai', () => {
    expect(essaiPourCheckout(finDans(1), false, MAINTENANT)).toBeNull()
    expect(essaiPourCheckout(finDans(-3), false, MAINTENANT)).toBeNull()
  })
})
