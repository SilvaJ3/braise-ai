import { describe, expect, it } from 'vitest'
import {
  MENTION_RELEVE,
  avertissements,
  couvertureReleve,
  libellePeriode,
  montantReleve,
  releveFilename,
  resumeVentes,
  valeurReprises,
  type ReleveDoc,
  type ReleveLigne,
} from './releve-doc'

const ligne = (p: Partial<ReleveLigne>): ReleveLigne => ({
  cle: 'nom:bougie ambre',
  produit_id: null,
  designation: 'Bougie ambre',
  prix_unitaire: 28,
  ventes: 0,
  reprises: 0,
  montant: 0,
  ...p,
})

const doc = (p: Partial<ReleveDoc> = {}): ReleveDoc => ({
  numero: 'REL-2026-001',
  emis_le: '2026-09-20T08:00:00.000Z',
  periode_debut: '2026-09-18',
  periode_fin: '2026-09-18',
  emetteur: {
    nom: 'Braaise — compte test',
    adresse: '',
    telephone: '',
    tva: '',
    email: '',
    mention_signature: '',
  },
  boutique_nom: 'Concept Store Le Marais',
  boutique_adresse: '10 rue des Rosiers, Paris',
  boutique_email: 'contact@lemarais-store.fr',
  mode: 'depot_vente',
  lignes: [],
  total_ventes: 0,
  nb_pieces: 0,
  nb_reprises: 0,
  valeur_reprises: 0,
  nb_declarations: 1,
  a_valider: 0,
  ...p,
})

describe('le montant d’un relevé', () => {
  it('additionne les ventes et laisse les reprises dehors', () => {
    const lignes = [
      ligne({ ventes: 2, montant: 56 }),
      ligne({ designation: 'Bougie cèdre', prix_unitaire: 32, ventes: 1, reprises: 1, montant: 32 }),
    ]
    expect(montantReleve(lignes)).toBe(88)
    // La reprise vaut 32 € pour information — elle ne se facture pas.
    expect(valeurReprises(lignes)).toBe(32)
    expect(montantReleve(lignes) - valeurReprises(lignes)).toBe(56)
  })

  it('arrondit au centime, sans flottant qui traîne', () => {
    expect(montantReleve([ligne({ ventes: 3, montant: 0.1 + 0.2 })])).toBe(0.3)
  })
})

describe('les phrases du relevé', () => {
  it('résume ce qui a bougé, en taisant les zéros', () => {
    expect(resumeVentes({ nb_pieces: 3, nb_reprises: 1 })).toBe('3 pièces vendues · 1 reprise (non facturée)')
    expect(resumeVentes({ nb_pieces: 1, nb_reprises: 0 })).toBe('1 pièce vendue')
    expect(resumeVentes({ nb_pieces: 0, nb_reprises: 2 })).toBe('2 reprises (non facturées)')
    expect(resumeVentes({ nb_pieces: 0, nb_reprises: 0 })).toBe('Aucun mouvement')
  })

  it('date la période, et ne répète pas la même date deux fois', () => {
    expect(libellePeriode({ periode_debut: '2026-09-18', periode_fin: '2026-09-18' })).toBe('du 18/09/2026')
    expect(libellePeriode({ periode_debut: '2026-09-01', periode_fin: '2026-09-18' })).toBe('du 01/09/2026 au 18/09/2026')
    expect(libellePeriode({ periode_debut: null, periode_fin: null })).toBe('—')
  })

  it('dit combien de relevés reçus il couvre', () => {
    expect(couvertureReleve({ nb_declarations: 1 })).toBe('1 relevé reçu')
    expect(couvertureReleve({ nb_declarations: 3 })).toBe('3 relevés reçus')
  })

  it('avertit sans bloquer : une déclaration pas encore validée compte quand même', () => {
    expect(avertissements({ lignes: [ligne({ ventes: 1, montant: 28 })], a_valider: 1, total_ventes: 28 })).toEqual([
      "Un relevé reçu n'est pas encore validé : ses ventes comptent quand même dans ce montant.",
    ])
    expect(avertissements({ lignes: [ligne({ ventes: 1, montant: 28 })], a_valider: 2, total_ventes: 28 })[0]).toContain(
      '2 relevés reçus ne sont pas encore validés',
    )
    expect(avertissements({ lignes: [], a_valider: 0, total_ventes: 0 })[0]).toContain("Rien à facturer pour l'instant")
  })

  it('dit que le relevé n’est pas la facture, et que la reprise n’en est pas une', () => {
    expect(MENTION_RELEVE).toContain('base à la facture')
    expect(MENTION_RELEVE).toContain('Les reprises n’y sont pas facturées'.replace('’', "'"))
    expect(MENTION_RELEVE).toContain('Le bon de dépôt signé reste')
  })
})

describe('le nom du fichier', () => {
  it('porte le numéro du relevé', () => {
    expect(releveFilename(doc())).toBe('releve-REL-2026-001.pdf')
  })

  it('dit « aperçu » tant que le relevé n’est pas émis', () => {
    expect(releveFilename(doc({ numero: null }))).toBe('releve-apercu-2026-09-20.pdf')
  })
})
