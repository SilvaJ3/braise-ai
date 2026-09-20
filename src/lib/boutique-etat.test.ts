import { describe, expect, it } from 'vitest'
import {
  STATUT_RELEVE_LABEL,
  TEXTE_ECART,
  alertesBoutiques,
  estNouveau,
  jourDeIso,
  lienBoutiqueUrl,
  messageErreur,
  periodeLisible,
  resumeReleve,
  totalRestant,
  type BoutiqueEtat,
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
  // L'adresse est la même pour tout le monde, et elle ne dépend plus de la page courante : c'est
  // l'adresse définitive. Le côté serveur (`supabase/functions/_shared/lien-boutique.test.ts`)
  // affirme la même chaîne — si l'une des deux dérive, un test tombe.
  it('porte l’adresse définitive, quel que soit l’endroit d’où on la lit', () => {
    expect(lienBoutiqueUrl('abc123')).toBe('https://www.braaise.io/boutique/abc123')
  })

  it('a une seule barre oblique entre la base et le chemin', () => {
    expect(lienBoutiqueUrl('abc123', 'https://exemple.be/')).toBe('https://exemple.be/boutique/abc123')
    expect(lienBoutiqueUrl('abc123', 'https://exemple.be//')).toBe('https://exemple.be/boutique/abc123')
  })

  it('encode un jeton qui contient des caractères réservés', () => {
    expect(lienBoutiqueUrl('a+b/c')).toBe('https://www.braaise.io/boutique/a%2Bb%2Fc')
  })

  it('ne fabrique pas d’adresse bancale quand il n’y a pas de jeton', () => {
    expect(lienBoutiqueUrl('')).toBe('https://www.braaise.io')
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

describe('ce que les boutiques attendent', () => {
  function etat(over: Partial<BoutiqueEtat> = {}): BoutiqueEtat {
    return {
      id: 'b1',
      nom: 'Lära Concept Store',
      mode: 'depot_vente',
      jeton: 'jeton',
      lien_actif: true,
      bons_en_attente_de_confirmation: 0,
      pieces: [],
      declarations: [],
      contestations: [],
      contestations_non_vues: 0,
      ...over,
    }
  }

  it('rien à signaler quand tout est traité', () => {
    expect(alertesBoutiques([etat()], [])).toEqual([])
  })

  it('un relevé reçu se voit, et se nomme par son mois', () => {
    const a = alertesBoutiques([etat({ declarations: [releve({ periode: '2026-08-01' })] })], [])
    expect(a).toHaveLength(1)
    expect(a[0].quoi).toBe('releve')
    expect(a[0].texte).toBe('Un relevé de août 2026 à valider')
    expect(a[0].boutiqueId).toBe('b1')
    expect(a[0].boutique).toBe('Lära Concept Store')
  })

  it('un relevé déjà validé ou écarté ne réclame plus rien', () => {
    expect(alertesBoutiques([etat({ declarations: [releve({ statut: 'validee' })] })], [])).toEqual([])
    expect(alertesBoutiques([etat({ declarations: [releve({ statut: 'corrigee' })] })], [])).toEqual([])
  })

  it('un bon à confirmer, un signalement non lu, une demande de réassort : trois alertes', () => {
    const un = etat({
      bons_en_attente_de_confirmation: 2,
      contestations_non_vues: 1,
    })
    const a = alertesBoutiques([un], [{ boutique_id: 'b1' }])
    expect(a.map((x) => x.quoi).sort()).toEqual(['bon', 'reassort', 'signalement'])
    expect(a.find((x) => x.quoi === 'bon')?.texte).toBe('2 bons en attente de sa confirmation')
    expect(a.find((x) => x.quoi === 'signalement')?.texte).toBe('Elle a signalé un bon')
    expect(a.find((x) => x.quoi === 'reassort')?.texte).toBe('Elle demande un réassort')
  })

  it('une demande de réassort sans boutique connue ne fabrique pas d’alerte', () => {
    expect(alertesBoutiques([etat()], [{ boutique_id: 'inconnue' }, { boutique_id: null }])).toEqual([])
  })

  it('les demandes d’une même boutique sont groupées', () => {
    const a = alertesBoutiques([etat()], [{ boutique_id: 'b1' }, { boutique_id: 'b1' }])
    expect(a).toHaveLength(1)
    expect(a[0].texte).toBe('2 demandes de réassort')
  })
})
