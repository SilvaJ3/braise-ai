import { describe, expect, it } from 'vitest'
import {
  STATUT_RELEVE_LABEL,
  TEXTE_ECART,
  estNouveau,
  jourDeIso,
  lienBoutiqueUrl,
  messageErreur,
  periodeLisible,
  resumeReleve,
  totalRestant,
  type ContestationBoutique,
  type PieceBoutique,
  type ReleveBoutique,
} from './boutique-etat'

function piece(partiel: Partial<PieceBoutique>): PieceBoutique {
  return {
    cle: 'nom:bougie',
    produit_id: null,
    designation: 'Bougie',
    prix: 12,
    depose: 0,
    vendu: 0,
    repris: 0,
    entre: 0,
    reste: 0,
    ...partiel,
  }
}

function releve(partiel: Partial<ReleveBoutique>): ReleveBoutique {
  return {
    id: 'd1',
    periode: '2026-09-01',
    statut: 'declaree',
    note: null,
    declare_le: '2026-09-19T20:00:00+00:00',
    facturable: 0,
    ventes: 0,
    reprises: 0,
    entrees: 0,
    alerte: false,
    ...partiel,
  }
}

describe('le lien de la boutique', () => {
  it('se construit sur braaise.io', () => {
    expect(lienBoutiqueUrl('abc123', 'https://braaise.io')).toBe('https://braaise.io/boutique/?t=abc123')
  })

  it('ne double pas la barre oblique d’une adresse qui finit par /', () => {
    expect(lienBoutiqueUrl('abc123', 'https://braise-test.vercel.app/')).toBe(
      'https://braise-test.vercel.app/boutique/?t=abc123',
    )
  })

  it('reste relatif quand il n’y a pas d’origine (hors navigateur)', () => {
    expect(lienBoutiqueUrl('abc123')).toBe('/boutique/?t=abc123')
  })

  it('encode un jeton qui contient des caractères réservés', () => {
    expect(lienBoutiqueUrl('a+b/c', 'https://braaise.io')).toBe(
      'https://braaise.io/boutique/?t=a%2Bb%2Fc',
    )
  })
})

describe('le restant chez la boutique', () => {
  it('additionne les restes de chaque pièce', () => {
    expect(totalRestant([piece({ reste: 3 }), piece({ reste: 2.5 })])).toBe(5.5)
  })

  it('vaut zéro quand rien n’est confirmé chez elle', () => {
    expect(totalRestant([])).toBe(0)
  })

  it('ignore les mouvements : seul le reste compte', () => {
    expect(totalRestant([piece({ depose: 10, vendu: 7, repris: 1, entre: 2, reste: 4 })])).toBe(4)
  })
})

describe('le résumé d’un relevé', () => {
  it('nomme chaque mouvement, du plus courant au plus rare', () => {
    expect(resumeReleve(releve({ ventes: 2, reprises: 1 }))).toBe('2 vendues · 1 reprise')
  })

  it('accorde au singulier', () => {
    expect(resumeReleve(releve({ ventes: 1 }))).toBe('1 vendue')
  })

  it('dit « reçu sans bon » pour une entrée, parce que ce n’est pas une vente', () => {
    expect(resumeReleve(releve({ ventes: 2, entrees: 3 }))).toBe('2 vendues · 3 entrées sans bon')
  })

  it('le dit franchement quand il n’y a rien', () => {
    expect(resumeReleve(releve({}))).toBe('Aucun mouvement')
  })

  it('n’arrondit pas les quantités décimales', () => {
    expect(resumeReleve(releve({ ventes: 2.5, reprises: 0.5 }))).toBe('2,5 vendues · 0,5 reprise')
  })
})

describe('les libellés de la période et des dates', () => {
  it('écrit la période en toutes lettres', () => {
    expect(periodeLisible('2026-09-01')).toBe('septembre 2026')
  })

  it('laisse passer une période qu’on ne sait pas lire', () => {
    expect(periodeLisible('septembre')).toBe('septembre')
  })

  // Le jour est celui du fuseau de la personne qui lit (Bruxelles) : un relevé envoyé à 00 h 05
  // heure belge est daté du 20, même si l'horodatage porte encore la date de la veille en UTC.
  it('rend un horodatage en jour court, à l’heure de la personne qui lit', () => {
    expect(jourDeIso('2026-09-19T12:05:00+00:00')).toBe('19/09/2026')
  })

  it('suit le fuseau local plutôt qu’UTC', () => {
    expect(jourDeIso('2026-09-20T00:05:00+02:00')).toBe('20/09/2026')
  })

  it('ne fabrique pas une date à partir de rien', () => {
    expect(jourDeIso(null)).toBe('—')
    expect(jourDeIso('n’importe quoi')).toBe('—')
  })
})

describe('les statuts et les messages d’erreur', () => {
  it('nomme les trois statuts d’un relevé', () => {
    expect(Object.keys(STATUT_RELEVE_LABEL).sort()).toEqual(['corrigee', 'declaree', 'validee'])
  })

  it('traduit un code d’erreur de la base', () => {
    expect(messageErreur('bon_inconnu')).toBe("Ce bon n'est pas rattaché à cette boutique.")
  })

  it('n’invente pas de traduction pour un code inconnu', () => {
    expect(messageErreur('quelque_chose_de_nouveau')).toBe('Erreur : quelque_chose_de_nouveau')
  })

  it('dit ce qui est signalé sans le confondre avec une erreur', () => {
    expect(TEXTE_ECART).toContain('à toi de trancher')
  })
})

describe('un signalement de la boutique', () => {
  const base: ContestationBoutique = {
    id: 'c1',
    bon_id: 'b1',
    numero: '42',
    date_depot: '2026-09-10',
    message: 'Il manque une bougie.',
    cree_le: '2026-09-19T20:00:00+00:00',
    vu_le: null,
  }

  it('est nouveau tant que l’artisane ne l’a pas ouvert', () => {
    expect(estNouveau(base)).toBe(true)
    expect(estNouveau({ ...base, vu_le: '2026-09-19T21:00:00+00:00' })).toBe(false)
  })
})
