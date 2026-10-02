// Ce que le cron de l'abonnement doit faire, vérifié sans base, sans réseau et sans horloge.
//
// Le test est écrit du point de vue de ce qu'un artisan reçoit : deux jours avant la fin de l'essai,
// la veille, puis plus rien si l'essai bascule en abonnement ; trois relances après un prélèvement
// refusé, et la fermeture une semaine après la dernière. Chaque cas douteux est là parce qu'il est
// arrivé dans un autre produit : la relance qui part deux jours de suite, le mail qui annonce un
// prélèvement à quelqu'un qui a déjà résilié, l'avis de reconduction envoyé pendant l'essai.

import { describe, expect, it } from 'vitest'
import { actionsDuJour, majDeLaction, type CompteAbonnement } from './rappels-abonnement'

const MAINTENANT = new Date('2026-10-02T07:15:00Z')

/** Un compte en essai qui finit dans `jours`, et rien d'autre. */
function enEssai(jours: number, extra: Partial<CompteAbonnement> = {}): CompteAbonnement {
  return {
    user_id: 'u-1',
    email: 'artisan@example.be',
    abonnement_statut: 'actif',
    essai_fin: new Date(MAINTENANT.getTime() + jours * 86_400_000).toISOString(),
    abonnement_annule: false,
    ...extra,
  }
}

describe('actionsDuJour — les rappels d’essai', () => {
  it('prévient deux jours avant la fin', () => {
    const actions = actionsDuJour([enEssai(2)], MAINTENANT)
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ type: 'essai', jours: 2 })
  })

  it('prévient la veille', () => {
    const actions = actionsDuJour([enEssai(1)], MAINTENANT)
    expect(actions[0]).toMatchObject({ type: 'essai', jours: 1 })
  })

  it('ne dit rien quatre jours avant, ni le jour même de la fin', () => {
    expect(actionsDuJour([enEssai(4)], MAINTENANT)).toEqual([])
    expect(actionsDuJour([enEssai(0)], MAINTENANT)).toEqual([])
  })

  it('ne renvoie pas un rappel déjà parti', () => {
    const deja = enEssai(2, { essai_rappel_j2_le: '2026-10-02T00:00:00Z' })
    expect(actionsDuJour([deja], MAINTENANT)).toEqual([])
  })

  it('ne menace PAS de prélever quelqu’un qui vient de résilier', () => {
    // Un abonnement arrêté pendant l'essai reste `actif` chez Stripe jusqu'à la fin : sans le
    // drapeau `abonnement_annule`, ce compte recevrait « voici ce qui va être prélevé ».
    expect(actionsDuJour([enEssai(2, { abonnement_annule: true })], MAINTENANT)).toEqual([])
  })

  it('ne rappelle rien à un compte qui n’a jamais ouvert d’essai', () => {
    const neuf: CompteAbonnement = {
      user_id: 'u-2',
      email: 'neuf@example.be',
      abonnement_statut: 'aucun',
      essai_fin: MAINTENANT.toISOString(),
    }
    expect(actionsDuJour([neuf], MAINTENANT)).toEqual([])
  })
})

describe('actionsDuJour — les impayés', () => {
  const impaye = (extra: Partial<CompteAbonnement> = {}): CompteAbonnement => ({
    user_id: 'u-3',
    email: 'artisan@example.be',
    abonnement_statut: 'en_retard',
    abonnement_annule: false,
    ...extra,
  })

  it('relance une première fois dès le refus', () => {
    const actions = actionsDuJour([impaye()], MAINTENANT)
    expect(actions[0]).toMatchObject({ type: 'impaye', relance: 1 })
  })

  it('ne relance pas deux fois dans la même semaine', () => {
    const actions = actionsDuJour(
      [impaye({ impaye_relances: 1, impaye_relance_le: '2026-10-01T07:15:00Z' })],
      MAINTENANT,
    )
    expect(actions).toEqual([])
  })

  it('relance la troisième fois après trois jours', () => {
    const actions = actionsDuJour(
      [impaye({ impaye_relances: 2, impaye_relance_le: '2026-09-28T07:15:00Z' })],
      MAINTENANT,
    )
    expect(actions[0]).toMatchObject({ type: 'impaye', relance: 3 })
  })

  it('ferme une semaine après la dernière relance, sans en envoyer une quatrième', () => {
    const actions = actionsDuJour(
      [impaye({ impaye_relances: 3, impaye_relance_le: '2026-09-20T07:15:00Z' })],
      MAINTENANT,
    )
    expect(actions).toEqual([{ type: 'fermeture', compte: expect.anything() }])
  })

  it('laisse une semaine pleine après la dernière relance', () => {
    const actions = actionsDuJour(
      [impaye({ impaye_relances: 3, impaye_relance_le: '2026-10-01T07:15:00Z' })],
      MAINTENANT,
    )
    expect(actions).toEqual([])
  })

  it('ne ferme pas deux fois', () => {
    const dejaFerme = impaye({
      impaye_relances: 3,
      impaye_relance_le: '2026-09-20T07:15:00Z',
      acces_ferme_le: '2026-09-27T07:15:00Z',
    })
    expect(actionsDuJour([dejaFerme], MAINTENANT)).toEqual([])
  })
})

describe('actionsDuJour — l’avis de reconduction', () => {
  const annuel = (finDansJours: number, extra: Partial<CompteAbonnement> = {}): CompteAbonnement => ({
    user_id: 'u-4',
    email: 'artisan@example.be',
    abonnement_statut: 'actif',
    abonnement_frequence: 'an',
    abonnement_annule: false,
    essai_fin: '2026-09-01T00:00:00Z',
    abonnement_fin: new Date(MAINTENANT.getTime() + finDansJours * 86_400_000).toISOString(),
    ...extra,
  })

  it('annonce la reconduction quinze jours avant', () => {
    expect(actionsDuJour([annuel(14)], MAINTENANT)[0]).toMatchObject({ type: 'renouvellement' })
  })

  it('n’annonce rien un mois avant, ni une fois la date passée', () => {
    expect(actionsDuJour([annuel(30)], MAINTENANT)).toEqual([])
    expect(actionsDuJour([annuel(-1)], MAINTENANT)).toEqual([])
  })

  it('ne dit rien d’un mensuel sans engagement', () => {
    expect(actionsDuJour([annuel(14, { abonnement_frequence: 'mois' })], MAINTENANT)).toEqual([])
  })

  it('ne le dit qu’une fois', () => {
    const deja = annuel(14, { renouvellement_avis_le: '2026-10-01T07:15:00Z' })
    expect(actionsDuJour([deja], MAINTENANT)).toEqual([])
  })

  it('ne l’envoie pas pendant l’essai, où la fin de période EST la fin de l’essai', () => {
    const enEssaiAnnuel = enEssai(2, {
      abonnement_frequence: 'an',
      abonnement_fin: new Date(MAINTENANT.getTime() + 2 * 86_400_000).toISOString(),
    })
    const actions = actionsDuJour([enEssaiAnnuel], MAINTENANT)
    expect(actions.map((a) => a.type)).toEqual(['essai'])
  })
})

describe('majDeLaction', () => {
  it('date le rappel d’essai dans la bonne colonne', () => {
    const actions = actionsDuJour([enEssai(2)], MAINTENANT)
    expect(majDeLaction(actions[0], MAINTENANT)).toEqual({
      essai_rappel_j2_le: MAINTENANT.toISOString(),
    })
  })

  it('compte la relance ET la date : sans le numéro, la suivante repartirait demain', () => {
    const compte: CompteAbonnement = { user_id: 'u-3', abonnement_statut: 'en_retard' }
    const actions = actionsDuJour([compte], MAINTENANT)
    expect(majDeLaction(actions[0], MAINTENANT)).toEqual({
      impaye_relances: 1,
      impaye_relance_le: MAINTENANT.toISOString(),
    })
  })

  it('date la fermeture, qui n’a pas de mail à tracer', () => {
    const compte: CompteAbonnement = {
      user_id: 'u-3',
      abonnement_statut: 'en_retard',
      impaye_relances: 3,
      impaye_relance_le: '2026-09-20T07:15:00Z',
    }
    const actions = actionsDuJour([compte], MAINTENANT)
    expect(majDeLaction(actions[0], MAINTENANT)).toEqual({
      acces_ferme_le: MAINTENANT.toISOString(),
    })
  })
})
