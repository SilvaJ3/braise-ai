import { describe, expect, it } from 'vitest'
import {
  dateDemande,
  demandesATraiter,
  demandesTraitees,
  libelleAction,
  libelleStatut,
  peutAgir,
  resultatTraitement,
  resumeDemande,
  resumeListe,
  statutDemande,
  type DemandeAcces,
} from './demandes-acces'

const demande = (p: Partial<DemandeAcces>): DemandeAcces => ({
  id: 'x',
  email: 'atelier@exemple.be',
  atelier: null,
  message: null,
  statut: 'nouvelle',
  jeton: 'a'.repeat(32),
  created_at: '2026-09-19T07:20:30.000Z',
  traitee_at: null,
  invitation_code: null,
  ...p,
})

// Les deux demandes réelles du 19/09, telles qu'elles sont en base.
const REELLES: DemandeAcces[] = [
  demande({ id: 'a', email: 'silvabraga.junior+demo@gmail.com', atelier: 'Atelier du Coin',
    message: 'Trois boutiques et deux marchés par mois.', created_at: '2026-09-19T07:20:30.000Z' }),
  demande({ id: 'b', email: 'silvabraga.junior@gmail.com', created_at: '2026-09-19T07:09:06.000Z',
    statut: 'validee', jeton: null, invitation_code: 'ABC123', traitee_at: '2026-09-19T09:00:00.000Z' }),
  demande({ id: 'c', email: 'refusee@exemple.be', created_at: '2026-09-18T09:00:00.000Z',
    statut: 'refusee', jeton: null }),
]

describe('statutDemande', () => {
  it('garde les trois statuts connus', () => {
    for (const s of ['nouvelle', 'validee', 'refusee'] as const) expect(statutDemande(s)).toBe(s)
  })

  it('ramène tout le reste à « nouvelle »', () => {
    for (const v of [null, undefined, '', 'VALIDEe', 1, {}]) expect(statutDemande(v)).toBe('nouvelle')
  })
})

describe('demandesATraiter / demandesTraitees', () => {
  it('sépare les deux et trie dans le bon sens', () => {
    const aTraiter = demandesATraiter([
      demande({ id: 'recente', created_at: '2026-09-20T10:00:00.000Z' }),
      ...REELLES,
    ])
    // La file se lit de la plus ancienne à la plus récente : on répond dans l'ordre reçu.
    expect(aTraiter.map((d) => d.id)).toEqual(['a', 'recente'])

    const traitees = demandesTraitees(REELLES)
    // Le journal se lit de la plus récente à la plus ancienne.
    expect(traitees.map((d) => d.id)).toEqual(['b', 'c'])
  })

  it('ne perd ni ne duplique aucune ligne', () => {
    const tout = demandesATraiter(REELLES).length + demandesTraitees(REELLES).length
    expect(tout).toBe(REELLES.length)
  })

  it('ne modifie pas la liste reçue', () => {
    const copie = REELLES.map((d) => d.id)
    demandesATraiter(REELLES)
    demandesTraitees(REELLES)
    expect(REELLES.map((d) => d.id)).toEqual(copie)
  })
})

describe('peutAgir', () => {
  it('exige à la fois le statut « nouvelle » et un jeton', () => {
    expect(peutAgir(demande({}))).toBe(true)
    expect(peutAgir(demande({ statut: 'validee' }))).toBe(false)
    expect(peutAgir(demande({ statut: 'refusee' }))).toBe(false)
    // Un jeton vidé par le serveur : la ligne est encore « nouvelle » mais plus rien n'est jouable.
    expect(peutAgir(demande({ jeton: null }))).toBe(false)
    expect(peutAgir(demande({ jeton: '' }))).toBe(false)
  })
})

describe('libellés', () => {
  it('nomme les trois états', () => {
    expect(libelleStatut('nouvelle')).toBe('À traiter')
    expect(libelleStatut('validee')).toBe('Invitation envoyée')
    expect(libelleStatut('refusee')).toBe('Refusée')
    expect(libelleStatut(undefined)).toBe('À traiter')
  })

  it('identifie une demande par son atelier, sinon par son adresse', () => {
    expect(resumeDemande(demande({ atelier: 'Atelier du Coin' }))).toBe('Atelier du Coin')
    expect(resumeDemande(demande({ atelier: '   ' }))).toBe('atelier@exemple.be')
    expect(resumeDemande(demande({ atelier: null }))).toBe('atelier@exemple.be')
  })

  it('dit ce qu’il reste à faire, au singulier comme au pluriel', () => {
    expect(resumeListe([])).toBe('Aucune demande en attente.')
    expect(resumeListe([demande({})])).toBe('1 demande en attente.')
    expect(resumeListe([demande({ id: '1' }), demande({ id: '2' })])).toBe('2 demandes en attente.')
    // Les demandes traitées ne comptent pas dans ce qui reste à faire.
    expect(resumeListe(REELLES)).toBe('1 demande en attente.')
  })

  it('écrit une date lisible, et rien pour une date inutilisable', () => {
    expect(dateDemande('2026-09-19T07:20:30.000Z')).toContain('septembre 2026')
    for (const v of [null, undefined, '', 'pas une date']) expect(dateDemande(v)).toBeNull()
  })

  it('écrit sur le bouton ce qu’il déclenche', () => {
    expect(libelleAction('valider')).toBe('Valider et inviter')
    expect(libelleAction('refuser')).toBe('Refuser')
  })
})

describe('resultatTraitement', () => {
  it('annonce l’invitation envoyée avec l’adresse', () => {
    const r = resultatTraitement('validee', 'atelier@exemple.be')
    expect(r.ton).toBe('ok')
    expect(r.texte).toContain('atelier@exemple.be')
  })

  it('dit qu’un refus n’envoie aucun mail', () => {
    expect(resultatTraitement('refusee', 'atelier@exemple.be').texte).toContain('Aucun mail')
  })

  it('traite « déjà traitée » comme une information, pas comme une panne', () => {
    expect(resultatTraitement('deja_traitee').ton).toBe('info')
    expect(resultatTraitement('deja_traitee').texte).toContain('déjà')
  })

  it('reste sur « erreur » pour le reste, sans inventer de cause', () => {
    for (const cas of ['jeton_inconnu', 'erreur', 'autre chose', undefined]) {
      expect(resultatTraitement(cas as string).ton).not.toBe('ok')
    }
    expect(resultatTraitement('erreur').ton).toBe('erreur')
  })
})
