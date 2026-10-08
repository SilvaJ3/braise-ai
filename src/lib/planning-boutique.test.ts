// Ce que le planning de la boutique affirme — et ce qu'il doit taire.
//
// Un planning qui parle trop ne se lit pas plus qu'un carnet : ces tests tiennent la forme (trois
// lignes au plus, la plus urgente d'abord) et les silences (rien à confirmer = pas de ligne, un
// dépôt attendu à trois mois ne se dit pas cette semaine).
import { describe, expect, it } from 'vitest'
import type { BonEspace, EtatEspace, FournisseurEspace, PieceEspace } from './espace-boutique'
import {
  depuisQuand,
  joursDepuis,
  ligneConfirmations,
  ligneDuMois,
  ligneProchainDepot,
  ligneReassort,
  planningDeLaSemaine,
} from './planning-boutique'

const AUJOURD_HUI = new Date('2026-10-08T09:00:00Z')

function piece(over: Partial<PieceEspace> = {}): PieceEspace {
  return {
    cle: 'produit:p1',
    produit_id: 'p1',
    designation: 'Bol en grès émaillé',
    prix: 24,
    depose: 6,
    vendu: 1,
    repris: 0,
    entre: 0,
    reste: 5,
    derniere_quantite: 6,
    dernier_depot: '2026-10-01',
    ...over,
  }
}

function bon(over: Partial<BonEspace> = {}): BonEspace {
  return {
    bon_id: 'b1',
    numero: '2026-010',
    date: '2026-10-07',
    statut: 'signe',
    confirme_le: null,
    mode: 'depot_vente',
    pieces: 6,
    valeur: 144,
    lignes: [],
    ...over,
  }
}

function fournisseur(over: Partial<FournisseurEspace> = {}): FournisseurEspace {
  return {
    partenaire_id: 'f1',
    artisan: 'Au Coin du Feu',
    boutique: null,
    delai_semaines: 2,
    deja_declare: true,
    a_confirmer: [],
    pieces: [piece()],
    ...over,
  }
}

function etat(fournisseurs: FournisseurEspace[], over: Partial<EtatEspace> = {}): EtatEspace {
  return { nom: 'Lära Concept Store', email: 'info@laraconceptstore.be', periode: '2026-10-01', fournisseurs, ...over }
}

describe('les âges, dits comme on les dit', () => {
  it('compte les jours, et ne dit jamais « il y a 0 jour »', () => {
    expect(joursDepuis('2026-10-08', AUJOURD_HUI)).toBe(0)
    expect(joursDepuis('2026-10-07', AUJOURD_HUI)).toBe(1)
    expect(joursDepuis('2026-10-01', AUJOURD_HUI)).toBe(7)
    expect(joursDepuis(null, AUJOURD_HUI)).toBeNull()
    expect(joursDepuis('pas une date', AUJOURD_HUI)).toBeNull()

    expect(depuisQuand('2026-10-08', AUJOURD_HUI)).toBe("aujourd'hui")
    expect(depuisQuand('2026-10-07', AUJOURD_HUI)).toBe('hier')
    expect(depuisQuand('2026-10-05', AUJOURD_HUI)).toBe('il y a 3 jours')
    expect(depuisQuand(null, AUJOURD_HUI)).toBe('')
  })
})

describe('ce qui bloque : les bons à confirmer', () => {
  it('un seul bon : l’artisan et son âge', () => {
    const ligne = ligneConfirmations(etat([fournisseur({ a_confirmer: [bon({ date: '2026-10-07' })] })]), AUJOURD_HUI)
    expect(ligne?.texte).toBe('Au Coin du Feu (hier) : 1 bon à confirmer')
    expect(ligne?.icone).toBe('🟠')
    expect(ligne?.vers).toBe('/espace-boutique/fournisseur/f1')
  })

  it('plusieurs bons : le compte, puis les deux plus anciens nommés', () => {
    const ligne = ligneConfirmations(
      etat([
        fournisseur({ a_confirmer: [bon({ date: '2026-10-01' })] }),
        fournisseur({
          partenaire_id: 'f2',
          artisan: 'Atelier Verveine',
          a_confirmer: [bon({ date: '2026-10-02' }), bon({ bon_id: 'b2', date: '2026-10-05' })],
        }),
      ]),
      AUJOURD_HUI,
    )
    expect(ligne?.texte).toBe('3 bons à confirmer — Au Coin du Feu (il y a 7 jours) et Atelier Verveine (il y a 6 jours)')
  })

  it('rien à confirmer : aucune ligne (un planning ne meuble pas)', () => {
    expect(ligneConfirmations(etat([fournisseur()]), AUJOURD_HUI)).toBeNull()
  })
})

describe('le rendez-vous du mois', () => {
  it('nomme qui attend, et sur quel mois', () => {
    const ligne = ligneDuMois(etat([fournisseur({ deja_declare: false, artisan: 'Atelier Verveine' })]), AUJOURD_HUI)
    expect(ligne?.texte).toBe('Relevé d’octobre : Atelier Verveine attend ton relevé')
    expect(ligne?.vers).toBe('/espace-boutique/fournisseur/f1/declarer')
  })

  it('plusieurs en retard : un compte, pas une liste', () => {
    const ligne = ligneDuMois(
      etat([
        fournisseur({ deja_declare: false }),
        fournisseur({ partenaire_id: 'f2', artisan: 'Atelier Verveine', deja_declare: false }),
      ]),
      AUJOURD_HUI,
    )
    expect(ligne?.texte).toBe('Relevé d’octobre : 2 artisans attendent ton relevé')
  })

  it('tout déclaré : on le dit, et ça se voit', () => {
    const ligne = ligneDuMois(etat([fournisseur({ deja_declare: true })]), AUJOURD_HUI)
    expect(ligne?.texte).toBe('Relevé d’octobre : tout est déclaré')
    expect(ligne?.icone).toBe('✅')
  })
})

describe('le réassort à prévoir', () => {
  it('dit combien de pièces sont en fin de rayon', () => {
    const ligne = ligneReassort(etat([fournisseur({ pieces: [piece({ depose: 6, reste: 1 })] })]))
    expect(ligne?.texte).toBe('1 pièce presque épuisée chez Au Coin du Feu — pense au réassort')
  })

  it('ne dit rien d’un rayon encore garni', () => {
    expect(ligneReassort(etat([fournisseur({ pieces: [piece({ reste: 4 })] })]))).toBeNull()
    // Une pièce jamais déposée n'a rien à voir avec le réassort.
    expect(ligneReassort(etat([fournisseur({ pieces: [piece({ depose: 0, reste: 0 })] })]))).toBeNull()
  })
})

describe('le prochain dépôt, annoncé comme une indication', () => {
  it('ajoute le délai de l’artisan au dernier dépôt', () => {
    const ligne = ligneProchainDepot(etat([fournisseur()]), AUJOURD_HUI)
    expect(ligne?.texte).toBe('Prochain dépôt de Au Coin du Feu — vers le 15/10/2026')
  })

  it('se tait quand l’échéance est trop loin pour aider cette semaine', () => {
    const vieux = fournisseur({ pieces: [piece({ dernier_depot: '2026-08-01' })] })
    expect(ligneProchainDepot(etat([vieux]), AUJOURD_HUI)).toBeNull()
  })

  it('sans dépôt connu : rien à annoncer', () => {
    expect(ligneProchainDepot(etat([fournisseur({ pieces: [piece({ dernier_depot: null })] })]), AUJOURD_HUI)).toBeNull()
  })
})

describe('le planning entier', () => {
  it('met ce qui bloque en premier et ne dépasse pas trois lignes à l’écran', () => {
    const lignes = planningDeLaSemaine(
      etat([
        fournisseur({
          a_confirmer: [bon({ date: '2026-10-05' })],
          deja_declare: false,
          pieces: [piece({ depose: 6, reste: 1 })],
        }),
      ]),
      AUJOURD_HUI,
    )
    expect(lignes.map((l) => l.cle)).toEqual(['confirmer', 'mois', 'reassort', 'prochain'])
    expect(lignes.slice(0, 3)).toHaveLength(3)
  })

  it('sans artisan rattaché, il n’y a rien à planifier', () => {
    expect(planningDeLaSemaine(etat([]), AUJOURD_HUI)).toEqual([])
  })
})
