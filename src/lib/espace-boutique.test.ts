import { describe, expect, it } from 'vitest'
import {
  jour,
  lireBons,
  lireEtat,
  messageEspace,
  montant,
  periodeLisible,
  quantite,
  resumeFournisseur,
  statutBon,
  totalRestant,
  type BonEspace,
} from './espace-boutique'

// L'écran de la boutique lit des `jsonb` rendus par la base : ce fichier vérifie la couche qui les
// met en forme, sans base et sans navigateur. Ce qui casse ici casse l'écran — un `reste` mal
// recalculé affiche un stock qui n'existe pas.

const BON_BRUT = {
  bon_id: 'b1',
  numero: '2026-004',
  date: '2026-09-10',
  statut: 'envoye',
  confirme_le: '2026-09-19T19:06:17.148783+00:00',
  mode: 'depot_vente',
  pieces: 5,
  valeur: '125.00',
  lignes: [
    { designation: 'Bougie Pastel', quantite: '2', prix: '25.00' },
    { designation: 'Coffret brûleur', quantite: 3, prix: 25 },
  ],
}

describe('lireEtat', () => {
  it('rend un état vide sans erreur quand la base répond une erreur', () => {
    expect(lireEtat({ erreur: 'pas_un_compte_boutique' })).toEqual({
      etat: null,
      erreur: 'pas_un_compte_boutique',
    })
    // Une réponse illisible ne fabrique pas de fournisseurs : elle rend un état vide.
    expect(lireEtat(null).etat).toEqual({ nom: '', email: '', periode: '', fournisseurs: [] })
  })

  it('met en forme les partenaires et calcule le restant à partir de la base', () => {
    const { etat, erreur } = lireEtat({
      nom: 'Lära Concept Store',
      email: 'info@laraconceptstore.be',
      periode: '2026-09-01',
      partenaires: [
        {
          partenaire_id: 'p1',
          artisan: 'Atelier de démonstration',
          delai_semaines: '3',
          deja_declare: true,
          a_confirmer: [BON_BRUT],
          pieces: [
            { cle: 'produit:x', designation: 'Bougie Pastel', prix: 25, depose: 7, vendu: 2, repris: 0, entre: 0, reste: 5 },
            { cle: 'nom:coffret brûleur', designation: 'Coffret brûleur', prix: 40, depose: 2, vendu: 0, repris: 1, entre: 1, reste: 2 },
          ],
        },
      ],
    })

    expect(erreur).toBeNull()
    expect(etat?.nom).toBe('Lära Concept Store')
    const f = etat!.fournisseurs[0]
    expect(f.partenaire_id).toBe('p1')
    expect(f.delai_semaines).toBe(3)
    expect(f.deja_declare).toBe(true)
    expect(f.pieces.map((p) => p.reste)).toEqual([5, 2])
    expect(f.a_confirmer).toHaveLength(1)
    expect(f.a_confirmer[0].numero).toBe('2026-004')
    expect(f.a_confirmer[0].lignes[1]).toEqual({ designation: 'Coffret brûleur', quantite: 3, prix: 25 })
  })

  it('recalcule le restant quand la clé manque : déposé + entré − vendu − repris', () => {
    const { etat } = lireEtat({
      partenaires: [
        { partenaire_id: 'p1', pieces: [{ designation: 'Ravissant', depose: 10, entre: 2, vendu: 4, repris: 1 }] },
      ],
    })
    expect(etat!.fournisseurs[0].pieces[0].reste).toBe(7)
  })

  it('ne devine pas de fournisseurs quand la base n’en donne pas', () => {
    expect(lireEtat({ nom: 'X' }).etat!.fournisseurs).toEqual([])
  })
})

describe('lireBons', () => {
  it('rend les bons, du plus récent au plus ancien tel que la base les ordonne', () => {
    const { bons, erreur } = lireBons({ ok: true, bons: [BON_BRUT, { bon_id: 'b2', statut: 'signe' }] })
    expect(erreur).toBeNull()
    expect(bons.map((b) => b.bon_id)).toEqual(['b1', 'b2'])
    expect(bons[0].valeur).toBe(125)
    expect(bons[1].confirme_le).toBeNull()
    expect(bons[1].lignes).toEqual([])
  })

  it('remonte le refus de la base au lieu de l’avaler', () => {
    expect(lireBons({ erreur: 'partenaire_inconnu' })).toEqual({ bons: [], erreur: 'partenaire_inconnu' })
  })
})

describe('les formes d’affichage', () => {
  it('montant : euros à la belge', () => {
    expect(montant(35)).toBe('35 €')
    expect(montant('12.5')).toBe('12,50 €')
    expect(montant(0)).toBe('0 €')
    expect(montant(undefined)).toBe('0 €')
  })

  it('quantite : entier sans décimale, sinon une virgule', () => {
    expect(quantite(12)).toBe('12')
    expect(quantite('2.5')).toBe('2,5')
    expect(quantite(null)).toBe('0')
  })

  it('jour : date française, et « — » quand il n’y a rien à dire', () => {
    expect(jour('2026-09-15T12:00:00+00:00')).toBe('15/09/2026')
    expect(jour(null)).toBe('—')
    expect(jour('demain')).toBe('—')
  })

  it('periodeLisible : « septembre 2026 »', () => {
    expect(periodeLisible('2026-09-01')).toBe('septembre 2026')
    expect(periodeLisible('')).toBe('')
  })
})

describe('totalRestant', () => {
  it('additionne les restes pièce par pièce', () => {
    const pieces = [
      { cle: 'a', produit_id: null, designation: 'A', prix: 10, depose: 7, vendu: 2, repris: 0, entre: 0, reste: 5 },
      { cle: 'b', produit_id: null, designation: 'B', prix: 5, depose: 2, vendu: 0, repris: 0, entre: 2, reste: 4 },
    ]
    expect(totalRestant(pieces)).toBe(9)
  })

  it('accepte un restant négatif : une boutique peut avoir vendu plus qu’elle n’a de bons', () => {
    const pieces = [
      { cle: 'a', produit_id: null, designation: 'A', prix: 10, depose: 1, vendu: 3, repris: 0, entre: 0, reste: -2 },
    ]
    expect(totalRestant(pieces)).toBe(-2)
  })
})

describe('resumeFournisseur', () => {
  const bon = (confirme: boolean): BonEspace => ({
    bon_id: 'b',
    numero: null,
    date: null,
    statut: 'envoye',
    confirme_le: confirme ? '2026-09-19T00:00:00+00:00' : null,
    mode: null,
    pieces: 0,
    valeur: 0,
    lignes: [],
  })
  const piece = (reste: number, vendu = 0) => ({
    cle: 'a',
    produit_id: null,
    designation: 'A',
    prix: 10,
    depose: reste + vendu,
    vendu,
    repris: 0,
    entre: 0,
    reste,
  })

  it('dit les dépôts reçus, ceux à confirmer, les ventes et ce qui reste', () => {
    const texte = resumeFournisseur([bon(true), bon(true), bon(false)], [piece(5, 2)])
    expect(texte).toBe('2 dépôts reçus · 1 à confirmer · 7 pièces reçues · 2 vendues · 5 restantes')
  })

  it('ne dit pas les zéros', () => {
    expect(resumeFournisseur([bon(true)], [])).toBe('1 dépôt reçu')
    expect(resumeFournisseur([], [piece(0)])).toBe('0 dépôts reçus')
  })
})

describe('statutBon', () => {
  it('un bon confirmé porte sa date de réception, l’autre attend', () => {
    expect(statutBon({ confirme_le: '2026-09-19T10:00:00+00:00' } as BonEspace)).toEqual({
      texte: 'Reçu le 19/09/2026',
      recu: true,
    })
    expect(statutBon({ confirme_le: null } as BonEspace)).toEqual({ texte: 'À confirmer', recu: false })
  })
})

describe('messageEspace', () => {
  it('écrit les refus en français, jamais un code brut', () => {
    expect(messageEspace('pas_un_compte_boutique')).toBe("Ce compte n'est pas un compte de boutique.")
    expect(messageEspace(undefined)).toBe('Session expirée — reconnecte-toi.')
    expect(messageEspace('bizarre')).toBe('Erreur : bizarre')
  })
})
