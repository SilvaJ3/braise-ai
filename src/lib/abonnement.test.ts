import { describe, expect, it } from 'vitest'
import {
  OFFRES,
  TARIF_FONDATEUR_CENTIMES,
  alerteTarif,
  dateLisible,
  etatAbonnement,
  formuleFacturee,
  libelleSouscription,
  messagePaiement,
  montantLisible,
  montantOffre,
  noteFondateur,
  statutAbonnement,
} from './abonnement'

const MAINTENANT = new Date('2026-09-20T15:00:00.000Z')

describe('statutAbonnement', () => {
  it('garde les quatre statuts connus', () => {
    for (const s of ['aucun', 'actif', 'en_retard', 'resilie'] as const) {
      expect(statutAbonnement(s)).toBe(s)
    }
  })

  it('ramène tout le reste à « aucun »', () => {
    for (const v of [null, undefined, '', 'ACTIF', 'past_due', 3, {}]) {
      expect(statutAbonnement(v)).toBe('aucun')
    }
  })
})

describe('montantOffre', () => {
  it('annonce le prix public hors tarif fondateur', () => {
    expect(montantOffre('mois', 'mensuel')).toBe(OFFRES.mois.centimes)
    expect(montantOffre('an', 'annuel')).toBe(OFFRES.an.centimes)
    expect(montantOffre('mois', null)).toBe(3900)
    expect(montantOffre('mois', undefined)).toBe(3900)
  })

  it('applique 29 € au fondateur, sur le mensuel seulement', () => {
    expect(montantOffre('mois', 'fondateur')).toBe(TARIF_FONDATEUR_CENTIMES)
    // L'offre fondateur est « 29 € par mois pendant deux ans » : sur l'annuel, le coupon ne joue
    // pas, et c'est la même décision que celle du serveur (appliqueCouponFondateur).
    expect(montantOffre('an', 'fondateur')).toBe(39000)
    expect(montantOffre('mois', 'essai')).toBe(3900)
  })
})

describe('montantLisible', () => {
  it('écrit les montants comme au comptoir', () => {
    expect(montantLisible(2900)).toBe('29 €')
    expect(montantLisible(3900)).toBe('39 €')
    expect(montantLisible(39000)).toBe('390 €')
    expect(montantLisible(null)).toBeNull()
    expect(montantLisible(undefined)).toBeNull()
  })
})

describe('dateLisible', () => {
  it('écrit une date en clair', () => {
    expect(dateLisible('2026-10-20T00:00:00.000Z')).toBe('20 octobre 2026')
  })

  it('rend null plutôt qu’une date inventée', () => {
    expect(dateLisible(null)).toBeNull()
    expect(dateLisible(undefined)).toBeNull()
    expect(dateLisible('pas une date')).toBeNull()
  })
})

describe('etatAbonnement', () => {
  it('sans abonnement : rien n’est prélevé, on propose de souscrire, pas de portail', () => {
    const e = etatAbonnement('aucun', { maintenant: MAINTENANT })
    expect(e.badge).toBe('Aucun')
    expect(e.phrase).toContain('Aucun abonnement en cours')
    expect(e.peutSouscrire).toBe(true)
    expect(e.peutGerer).toBe(false)
  })

  it('actif : prochain prélèvement daté, carte et factures gérables', () => {
    const e = etatAbonnement('actif', {
      fin: '2026-10-20T09:00:00.000Z',
      maintenant: MAINTENANT,
    })
    expect(e.badge).toBe('Actif')
    expect(e.phrase).toBe('Abonnement en cours. Prochain prélèvement le 20 octobre 2026.')
    expect(e.fin).toBe('20 octobre 2026')
    expect(e.peutSouscrire).toBe(false)
    expect(e.peutGerer).toBe(true)
  })

  it('actif sans date de fin connue : l’écran n’invente aucune date', () => {
    const e = etatAbonnement('actif', { fin: null, maintenant: MAINTENANT })
    expect(e.phrase).toBe('Abonnement en cours.')
    expect(e.fin).toBeNull()
  })

  it('en retard : parle de la carte, jamais d’un accès coupé', () => {
    const e = etatAbonnement('en_retard', { maintenant: MAINTENANT })
    expect(e.badge).toBe('En retard')
    expect(e.phrase).toContain('Un prélèvement a échoué')
    expect(e.phrase).toContain('Stripe relance')
    expect(e.peutSouscrire).toBe(false)
    expect(e.peutGerer).toBe(true)
  })

  it('résilié mais période payée en cours : dit jusqu’à quand', () => {
    const e = etatAbonnement('resilie', {
      fin: '2026-10-20T09:00:00.000Z',
      maintenant: MAINTENANT,
    })
    expect(e.phrase).toBe('Abonnement résilié : il reste actif jusqu’au 20 octobre 2026.')
    expect(e.peutSouscrire).toBe(true)
    expect(e.peutGerer).toBe(true)
  })

  it('résilié et période finie : plus rien n’est prélevé', () => {
    const e = etatAbonnement('resilie', { fin: '2026-09-01T09:00:00.000Z', maintenant: MAINTENANT })
    expect(e.phrase).toBe('Abonnement terminé : plus rien n’est prélevé.')
  })

  it('une date illisible ne passe pas pour une date à venir', () => {
    const e = etatAbonnement('actif', { fin: 'zzz', maintenant: MAINTENANT })
    expect(e.phrase).toBe('Abonnement en cours.')
    expect(e.fin).toBeNull()
  })
})

describe('messagePaiement', () => {
  it('accuse réception du paiement sans promettre que c’est déjà écrit', () => {
    const m = messagePaiement('ok')
    expect(m?.ton).toBe('ok')
    expect(m?.texte).toContain('quelques secondes')
  })

  it('rassure sur l’annulation', () => {
    const m = messagePaiement('annule')
    expect(m?.ton).toBe('info')
    expect(m?.texte).toContain('rien n’a été prélevé')
  })

  it('ne dit rien quand il n’y a rien à dire', () => {
    expect(messagePaiement(null)).toBeNull()
    expect(messagePaiement(undefined)).toBeNull()
    expect(messagePaiement('autre chose')).toBeNull()
  })
})

describe('formuleFacturee', () => {
  it('reconnaît les trois montants possibles', () => {
    expect(formuleFacturee(2900)?.libelle).toBe('29 €/mois')
    expect(formuleFacturee(2900)?.tarif).toBe('fondateur')
    expect(formuleFacturee(3900)).toEqual({ libelle: '39 €/mois', frequence: 'mois', tarif: 'public' })
    expect(formuleFacturee(39000)).toEqual({ libelle: '390 €/an', frequence: 'an', tarif: 'public' })
  })

  it('ne devine rien pour un montant qu’il ne connaît pas', () => {
    expect(formuleFacturee(null)).toBeNull()
    expect(formuleFacturee(undefined)).toBeNull()
    expect(formuleFacturee(1234)).toBeNull()
    expect(formuleFacturee(0)).toBeNull()
  })
})

describe('libelleSouscription', () => {
  it('annonce le montant sur le bouton', () => {
    expect(libelleSouscription('mois', 'mensuel')).toBe('S’abonner — 39 €/mois')
    expect(libelleSouscription('an', 'mensuel')).toBe('S’abonner — 390 €/an')
    expect(libelleSouscription('mois', 'fondateur')).toBe('S’abonner — 29 €/mois')
    expect(libelleSouscription('an', 'fondateur')).toBe('S’abonner — 390 €/an')
  })
})

describe('noteFondateur', () => {
  it('ne parle de tarif fondateur qu’au fondateur', () => {
    expect(noteFondateur('fondateur')).toContain('29 €/mois pendant deux ans')
    expect(noteFondateur('mensuel')).toBeNull()
    expect(noteFondateur(null)).toBeNull()
  })
})

describe('alerteTarif', () => {
  it('signale un fondateur facturé au prix public', () => {
    expect(alerteTarif('fondateur', 3900)).toContain('39 €/mois')
    expect(alerteTarif('fondateur', 2900)).toBeNull()
    expect(alerteTarif('fondateur', 39000)).toBeNull()
    expect(alerteTarif('fondateur', null)).toBeNull()
    expect(alerteTarif('mensuel', 3900)).toBeNull()
  })
})
