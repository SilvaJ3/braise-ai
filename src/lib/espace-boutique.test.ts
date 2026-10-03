import { describe, expect, it } from 'vitest'
import {
  depassements,
  jour,
  lignesADeclarer,
  lignesDemandees,
  lireResultatDeclaration,
  totalDeclare,
  mouvementsEnvoyes,
  phraseDepose,
  repriseAutorisee,
  lireBon,
  lireBons,
  lireEtat,
  lireHistorique,
  messageEspace,
  moisLisible,
  montant,
  periodeLisible,
  propositionsReassort,
  quantite,
  resumeFournisseur,
  statutBon,
  texteStatutReleve,
  totalDemande,
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
      { cle: 'a', produit_id: null, designation: 'A', prix: 10, depose: 7, vendu: 2, repris: 0, entre: 0, reste: 5, derniere_quantite: 7 },
      { cle: 'b', produit_id: null, designation: 'B', prix: 5, depose: 2, vendu: 0, repris: 0, entre: 2, reste: 4, derniere_quantite: 2 },
    ]
    expect(totalRestant(pieces)).toBe(9)
  })

  it('accepte un restant négatif : une boutique peut avoir vendu plus qu’elle n’a de bons', () => {
    const pieces = [
      { cle: 'a', produit_id: null, designation: 'A', prix: 10, depose: 1, vendu: 3, repris: 0, entre: 0, reste: -2, derniere_quantite: 1 },
    ]
    expect(totalRestant(pieces)).toBe(-2)
  })
})

describe('propositionsReassort', () => {
  const pieceReassort = (cle: string, designation: string, derniere: number) => ({
    cle,
    produit_id: null,
    designation,
    prix: 10,
    depose: 10,
    vendu: 4,
    repris: 0,
    entre: 0,
    reste: 6,
    derniere_quantite: derniere,
  })

  it('propose la quantité du DERNIER dépôt, pas le total ni le restant', () => {
    expect(propositionsReassort([pieceReassort('produit:p1', 'Bol', 3)])).toEqual([
      { cle: 'produit:p1', designation: 'Bol', quantite: 3 },
    ])
  })

  it('écarte une pièce jamais déposée : zéro n’est pas une proposition à corriger', () => {
    expect(propositionsReassort([pieceReassort('nom:inconnu', 'Vase', 0)])).toEqual([])
  })

  it('écarte une pièce sans clé : la base ne saurait pas quoi résoudre', () => {
    expect(propositionsReassort([pieceReassort('', 'Sans clé', 2)])).toEqual([])
  })
})

describe('lignesDemandees', () => {
  it('ne garde que les quantités positives — une ligne mise à zéro est un retrait', () => {
    expect(
      lignesDemandees([
        { cle: 'a', designation: 'A', quantite: 2 },
        { cle: 'b', designation: 'B', quantite: 0 },
      ]),
    ).toEqual([{ cle: 'a', quantite: 2 }])
  })

  it('rend une demande vide quand tout est à zéro : la base refuserait « aucune_demande »', () => {
    expect(lignesDemandees([{ cle: 'a', designation: 'A', quantite: 0 }])).toEqual([])
  })
})

describe('totalDemande', () => {
  it('additionne les quantités demandées', () => {
    expect(
      totalDemande([
        { cle: 'a', designation: 'A', quantite: 3 },
        { cle: 'b', designation: 'B', quantite: 4 },
      ]),
    ).toBe(7)
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
    derniere_quantite: reste + vendu,
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

describe('déclarer ses ventes', () => {
  const piece = (cle: string, reste: number, prix = 10) => ({
    cle, produit_id: null, designation: `Pièce ${cle}`, prix, depose: reste, vendu: 0, repris: 0, entre: 0, reste, derniere_quantite: 0,
  })

  it('propose une ligne par pièce en stock, à zéro vente, et ignore ce qui est épuisé', () => {
    const l = lignesADeclarer([piece('a', 3), piece('b', 0), piece('c', 1, 25)])
    expect(l.map((x) => x.cle)).toEqual(['a', 'c'])
    expect(l.every((x) => x.ventes === 0)).toBe(true)
  })

  it('n’envoie que les pièces qui ont bougé (vendues ou reprises), en nombres entiers', () => {
    const l = lignesADeclarer([piece('a', 5), piece('b', 5), piece('c', 5), piece('d', 5)]).map((x, i) => ({
      ...x,
      ventes: [2, 0, 1.9, 0][i],
      reprises: [0, 0, 0, 2.7][i],
    }))
    expect(mouvementsEnvoyes(l)).toEqual([
      { cle: 'a', ventes: 2, reprises: 0 },
      { cle: 'c', ventes: 1, reprises: 0 },
      { cle: 'd', ventes: 0, reprises: 2 },
    ])
  })

  it('le total ne facture QUE les ventes : une reprise ne coûte rien à la boutique', () => {
    const l = lignesADeclarer([piece('a', 5, 12.5), piece('b', 5, 20)]).map((x, i) => ({
      ...x,
      ventes: [2, 1][i],
      reprises: [0, 3][i],
    }))
    expect(totalDeclare(l)).toEqual({ pieces: 3, montant: 45, reprises: 3, valeurReprises: 60 })
    expect(totalDeclare([])).toEqual({ pieces: 0, montant: 0, reprises: 0, valeurReprises: 0 })
  })

  it('repère les lignes où ventes + reprises dépassent le stock (signalé, jamais refusé)', () => {
    const l = lignesADeclarer([piece('a', 2), piece('b', 2), piece('c', 4)]).map((x, i) => ({
      ...x,
      ventes: [3, 2, 2][i],
      reprises: [0, 0, 3][i],
    }))
    expect(depassements(l).map((x) => x.cle)).toEqual(['a', 'c'])
  })

  it('une reprise ne se propose qu’en dépôt-vente : un bon en achat ferme la ferme', () => {
    const bon = (mode: string | null) => lireBon({ ...BON_BRUT, mode })
    expect(repriseAutorisee([])).toBe(true)
    expect(repriseAutorisee([bon('depot_vente'), bon(null)])).toBe(true)
    expect(repriseAutorisee([bon('depot_vente'), bon('achat_ferme')])).toBe(false)
  })

  it('le dépôt de 10 avec 3 reprises se lit « net 7 », sans réécrire le dépôt', () => {
    expect(phraseDepose({ depose: 10, repris: 0 })).toBe('déposé 10')
    expect(phraseDepose({ depose: 10, repris: 3 })).toBe('déposé 10, net 7 après 3 reprises')
    expect(phraseDepose({ depose: 10, repris: 1 })).toBe('déposé 10, net 9 après 1 reprise')
  })

  it('lit le résultat d’un envoi accepté, avec la valeur reprise, et dit « pas d’alerte » par défaut', () => {
    expect(lireResultatDeclaration({ ok: true, facturable: '52.5', valeur_reprises: 30, alerte: true })).toEqual({
      facturable: 52.5,
      valeurReprises: 30,
      alerte: true,
    })
    expect(lireResultatDeclaration({ ok: true, facturable: 10 })).toEqual({ facturable: 10, valeurReprises: 0, alerte: false })
    expect(lireResultatDeclaration(null)).toEqual({ facturable: 0, valeurReprises: 0, alerte: false })
  })

  it('« aucune_vente » a une phrase, jamais le code brut', () => {
    expect(messageEspace('aucune_vente')).toMatch(/Rien à déclarer/)
  })
})

describe('l’historique de ses ventes déclarées', () => {
  it('lit les totaux de chaque déclaration, dans l’ordre rendu par la base', () => {
    const { releves, erreur } = lireHistorique({
      historique: [
        { declaration: '2026-09-28', ventes: 4, reprises: 1, facturable: 52.5, statut: 'validee' },
        { declaration: '2026-08-30', ventes: '3', reprises: 0, facturable: '30' },
      ],
    })
    expect(erreur).toBeNull()
    expect(releves).toEqual([
      { declaration: '2026-09-28', ventes: 4, reprises: 1, facturable: 52.5, statut: 'validee' },
      { declaration: '2026-08-30', ventes: 3, reprises: 0, facturable: 30, statut: null },
    ])
  })

  it('un refus de la base remonte son code, une réponse vide donne une liste vide', () => {
    expect(lireHistorique({ erreur: 'partenaire_inconnu' })).toEqual({ releves: [], erreur: 'partenaire_inconnu' })
    expect(lireHistorique({ historique: [] }).releves).toEqual([])
    expect(lireHistorique(null).releves).toEqual([])
  })

  it('un statut inconnu devient « rien à dire », jamais un texte inventé', () => {
    const { releves } = lireHistorique({ historique: [{ declaration: '2026-09-28', statut: 'bizarre' }] })
    expect(releves[0].statut).toBeNull()
    expect(texteStatutReleve(releves[0].statut)).toBeNull()
  })

  it('dit le sort de chaque statut, dont celui d’un relevé écarté', () => {
    expect(texteStatutReleve('declaree')).toMatch(/pas encore regardé/)
    expect(texteStatutReleve('validee')).toMatch(/Validé/)
    expect(texteStatutReleve('corrigee')).toMatch(/ne compte plus/)
  })

  it('écrit le mois en toutes lettres, et « — » quand la date est illisible', () => {
    expect(moisLisible('2026-09-28')).toBe('septembre 2026')
    expect(moisLisible('2026-12-01T10:00:00Z')).toBe('décembre 2026')
    expect(moisLisible(null)).toBe('—')
    expect(moisLisible('2026-13-01')).toBe('—')
  })
})
