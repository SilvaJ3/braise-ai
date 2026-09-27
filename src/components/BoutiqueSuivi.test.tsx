import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { BoutiqueEtat, ReleveAEmettre, ReleveEmis } from '../lib/boutique-etat'
import type { Boutique } from '../lib/supabase'

// L'écran de suivi est monté pour de vrai, avec des données réalistes, et on regarde le HTML
// rendu : c'est le seul moyen de vérifier ce qui compte ici — que l'artisan voie le restant
// pièce par pièce, le montant facturable d'un relevé, ses deux issues, le lien et ce qui a été
// signalé. Un test qui n'appellerait que les fonctions de lib/boutique-etat ne dirait rien de ça.
//
// Le réseau est remplacé (lib/boutiques) et lib/depots aussi — ce dernier importe le client
// Supabase, qui exige des variables d'environnement : ce banc d'essai ne doit demander ni base,
// ni configuration.

const { etatCourant, releveCourant, emisCourants } = vi.hoisted(() => ({
  etatCourant: { valeur: null as unknown as BoutiqueEtat },
  releveCourant: { valeur: null as ReleveAEmettre | null },
  emisCourants: { valeur: [] as ReleveEmis[] },
}))

vi.mock('../lib/boutiques', () => ({
  useMesBoutiquesEtat: () => ({ data: [etatCourant.valeur], isLoading: false, error: null }),
  useCorrigerDeclaration: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useCouperLienBoutique: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useMarquerContestationVue: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Le relevé facturable parle au réseau (fonction edge + table des relevés émis) : remplacé ici,
// comme le reste. Ce qu'on vérifie, c'est ce qui s'écrit à l'écran.
vi.mock('../lib/releves', () => ({
  useReleveAEmettre: () => ({ data: releveCourant.valeur, isLoading: false, isError: false, error: null }),
  useRelevesEmis: () => ({ data: emisCourants.valeur, isLoading: false, isError: false, error: null }),
  useEmettreReleve: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  apercuReleve: vi.fn(),
  urlPdfReleve: vi.fn(),
}))

vi.mock('../lib/depots', () => ({
  fmtEuro: (n: number) => `${n} €`,
  fmtQte: (n: number) => String(n),
  fmtDateCourte: (iso: string) => iso,
}))

import BoutiqueSuivi from './BoutiqueSuivi'

const JETON = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6'

const boutique: Boutique = {
  id: 'b1',
  user_id: 'u1',
  nom: 'Lära Concept Store',
  mode: 'depot_vente',
  adresse: null,
  horaires: null,
  canal_prefere: null,
  email: null,
  telephone: null,
  notes: null,
  actif: true,
  lat: null,
  lng: null,
  created_at: '2026-09-01T00:00:00+00:00',
}

function etat(partiel: Partial<BoutiqueEtat> = {}): BoutiqueEtat {
  return {
    id: 'b1',
    nom: boutique.nom,
    mode: 'depot_vente',
    jeton: JETON,
    lien_actif: true,
    bons_en_attente_de_confirmation: 0,
    pieces: [],
    declarations: [],
    contestations: [],
    contestations_non_vues: 0,
    ...partiel,
  }
}

/** Le texte tel qu'un lecteur le lit : on défait l'échappement du HTML. */
function texte(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function rendre(
  partiel: Partial<BoutiqueEtat> = {},
  qui: Boutique = boutique,
  releve: ReleveAEmettre | null = null,
  emis: ReleveEmis[] = [],
): string {
  etatCourant.valeur = etat(partiel)
  releveCourant.valeur = releve
  emisCourants.valeur = emis
  return texte(renderToStaticMarkup(<BoutiqueSuivi boutique={qui} />))
}

/** Ce que la base rend pour ce qu'il reste à facturer (forme de `releve_a_emettre()`). */
function aFacturer(partiel: Partial<ReleveAEmettre> = {}): ReleveAEmettre {
  return {
    boutique: { id: 'b1', nom: boutique.nom, adresse: '10 rue des Rosiers, Paris', email: null, mode: 'depot_vente' },
    lignes: [],
    total_ventes: 0,
    nb_pieces: 0,
    nb_reprises: 0,
    valeur_reprises: 0,
    nb_declarations: 0,
    a_valider: 0,
    periode_debut: null,
    periode_fin: null,
    dernier_numero: null,
    dernier_emis_le: null,
    ...partiel,
  }
}

describe('la fiche d’une boutique, côté artisan', () => {
  it('montre ce qui reste chez elle, pièce par pièce, avec les mouvements qui l’expliquent', () => {
    const html = rendre({
      pieces: [
        {
          cle: 'produit:1',
          produit_id: '1',
          designation: 'Bougie cire de soja',
          prix: 12,
          depose: 9,
          vendu: 3,
          repris: 1,
          entre: 2,
          reste: 7,
        },
      ],
    })

    expect(html).toContain('Chez Lära Concept Store')
    expect(html).toContain('Bougie cire de soja')
    expect(html).toContain('12 € pièce')
    expect(html).toContain('7 restants')
    expect(html).toContain('Déposé 9')
    expect(html).toContain('reçu sans bon 2')
    expect(html).toContain('vendu 3')
    expect(html).toContain('repris 1')
    expect(html).toContain('7 pièces chez elle')
    // La règle du modèle est écrite à l'écran, pas seulement dans la base.
    expect(html).toContain('le restant se calcule, il ne se saisit jamais')
  })

  it('dit qu’une pièce qui reste au singulier ne prend pas de « s »', () => {
    const html = rendre({
      pieces: [
        {
          cle: 'p',
          produit_id: null,
          designation: 'Fondant',
          prix: 6,
          depose: 1,
          vendu: 0,
          repris: 0,
          entre: 0,
          reste: 1,
        },
      ],
    })

    expect(html).toContain('1 restant<')
  })

  it('dit combien de bons attendent encore sa confirmation', () => {
    const html = rendre({ bons_en_attente_de_confirmation: 2 })

    expect(html).toContain('2 bons attendent sa confirmation')
    expect(html).toContain("c'est la réception qui fait foi, pas l'envoi")
  })

  it('n’encombre pas l’écran du compte des bons quand il n’y en a aucun', () => {
    expect(rendre({ bons_en_attente_de_confirmation: 0 })).not.toContain('attend')
  })

  it('le dit franchement quand elle n’a encore rien chez elle', () => {
    expect(rendre()).toContain('Aucune pièce confirmée chez elle')
  })

  it('montre un relevé : la période, les mouvements, le montant facturable, le statut', () => {
    const html = rendre({
      declarations: [
        {
          id: 'd1',
          periode: '2026-09-01',
          statut: 'declaree',
          note: 'La vitrine a été refaite.',
          declare_le: '2026-09-19T12:00:00+00:00',
          facturable: 36,
          ventes: 3,
          reprises: 1,
          entrees: 0,
          alerte: false,
        },
      ],
    })

    expect(html).toContain('septembre 2026')
    expect(html).toContain('3 vendues · 1 reprise')
    expect(html).toContain('36 €')
    expect(html).toContain('à facturer')
    expect(html).toContain("les reprises n'entrent pas dans ce montant")
    expect(html).toContain('À valider')
    expect(html).toContain('Son mot : « La vitrine a été refaite. »')
    // Les deux issues de la décision du 19/09.
    expect(html).toContain('>Valider<')
    expect(html).toContain('>Corriger<')
  })

  it('signale un écart sans le confondre avec une erreur, et dit qui tranche', () => {
    const html = rendre({
      declarations: [
        {
          id: 'd1',
          periode: '2026-09-01',
          statut: 'declaree',
          note: null,
          declare_le: '2026-09-19T12:00:00+00:00',
          facturable: 36,
          ventes: 3,
          reprises: 0,
          entrees: 0,
          alerte: true,
        },
      ],
    })

    expect(html).toContain('écart signalé')
    expect(html).toContain('à toi de trancher')
  })

  it('dit ce qu’un relevé écarté devient, et laisse la trace', () => {
    const html = rendre({
      declarations: [
        {
          id: 'd1',
          periode: '2026-08-01',
          statut: 'corrigee',
          note: 'Deux ventes comptées deux fois.',
          declare_le: '2026-08-31T12:00:00+00:00',
          facturable: 0,
          ventes: 2,
          reprises: 0,
          entrees: 0,
          alerte: false,
        },
      ],
    })

    expect(html).toContain('Écarté')
    expect(html).toContain('ses mouvements ne comptent plus dans le stock')
    expect(html).toContain('Deux ventes comptées deux fois.')
  })

  it('donne le lien à transmettre, et de quoi le couper', () => {
    const html = rendre()

    expect(html).toContain(`https://www.braaise.io/boutique/${JETON}`)
    expect(html).toContain('Copier le lien')
    expect(html).toContain("Couper l'accès")
    // Ce que le lien n'est pas : un document contractuel.
    expect(html).toContain('ne remplace aucun document contractuel')
    expect(html).toContain('le bon signé reste la pièce qui fait foi')
  })

  it('dit clairement quand l’accès est coupé', () => {
    const html = rendre({ lien_actif: false })

    expect(html).toContain('accès coupé')
    expect(html).toContain('Cet accès est coupé')
    expect(html).not.toContain("Couper l'accès")
  })

  it('ne promet pas de lien là où il n’y en a pas', () => {
    const html = rendre({ jeton: null, lien_actif: false })

    expect(html).toContain('Aucun lien pour cette boutique')
    expect(html).not.toContain('Copier le lien')
  })

  it('affiche « ce bon ne correspond pas » comme un message, et rien de modifié', () => {
    const html = rendre({
      contestations: [
        {
          id: 'c1',
          bon_id: 'bon-42',
          numero: '42',
          date_depot: '2026-09-10',
          message: 'Il manque une bougie dans le carton.',
          cree_le: '2026-09-19T12:30:00+00:00',
          vu_le: null,
        },
      ],
      contestations_non_vues: 1,
    })

    expect(html).toContain("Ce qu'elle a signalé")
    expect(html).toContain('Bon n° 42')
    expect(html).toContain('« Il manque une bougie dans le carton. »')
    expect(html).toContain('nouveau')
    expect(html).toContain("Le bon n'a pas été modifié")
    expect(html).toContain('Marquer comme vu')
  })

  it('cesse de dire « nouveau » une fois le signalement vu', () => {
    const html = rendre({
      contestations: [
        {
          id: 'c1',
          bon_id: 'bon-42',
          numero: '42',
          date_depot: '2026-09-10',
          message: 'Il manque une bougie dans le carton.',
          cree_le: '2026-09-19T12:30:00+00:00',
          vu_le: '2026-09-19T18:00:00+00:00',
        },
      ],
    })

    expect(html).not.toContain('>nouveau<')
    expect(html).not.toContain('Marquer comme vu')
    expect(html).toContain('Vu le')
  })

  it('n’affiche pas de rubrique « signalé » quand il n’y a rien de signalé', () => {
    expect(rendre()).not.toContain("Ce qu'elle a signalé")
  })

  it('ne montre rien pour une autre boutique que celle qu’on regarde', () => {
    const html = rendre({}, { ...boutique, id: 'autre' })

    expect(html).toBe('')
  })
})

describe('le relevé facturable, côté artisan', () => {
  it('montre ce qui reste à facturer, pièce par pièce, et le total des ventes', () => {
    const html = rendre(
      {},
      boutique,
      aFacturer({
        lignes: [
          { cle: 'nom:bougie ambre', produit_id: null, designation: 'Bougie ambre', prix_unitaire: 28, ventes: 2, reprises: 0, montant: 56 },
          { cle: 'nom:bougie cèdre', produit_id: null, designation: 'Bougie cèdre', prix_unitaire: 32, ventes: 1, reprises: 1, montant: 32 },
        ],
        total_ventes: 88,
        nb_pieces: 3,
        nb_reprises: 1,
        valeur_reprises: 32,
        nb_declarations: 1,
        periode_debut: '2026-09-18',
        periode_fin: '2026-09-18',
      }),
    )

    expect(html).toContain('Relevé facturable')
    expect(html).toContain('88 € à facturer')
    expect(html).toContain('Bougie ambre')
    expect(html).toContain('2 × 28 €')
    expect(html).toContain('56 €')
    expect(html).toContain('du 18/09/2026')
    expect(html).toContain('1 relevé reçu')
    expect(html).toContain('3 pièces vendues · 1 reprise (non facturée)')
    // La reprise est montrée, et dite hors facturation.
    expect(html).toContain('mouvement de stock, hors facturation')
    // Ce que le document n'est pas.
    expect(html).toContain("sert de base à la facture")
    expect(html).toContain('>Voir le relevé<')
    expect(html).toContain('>Émettre le relevé<')
  })

  it('prévient qu’un relevé reçu non validé compte quand même', () => {
    const html = rendre(
      {},
      boutique,
      aFacturer({
        lignes: [{ cle: 'p', produit_id: null, designation: 'Fondant', prix_unitaire: 6, ventes: 1, reprises: 0, montant: 6 }],
        total_ventes: 6,
        nb_pieces: 1,
        a_valider: 1,
      }),
    )

    expect(html).toContain("Un relevé reçu n'est pas encore validé")
    expect(html).toContain('comptent quand même dans ce montant')
  })

  it('ne propose rien à facturer quand rien n’a bougé', () => {
    const html = rendre({}, boutique, aFacturer({ nb_declarations: 1 }))

    expect(html).toContain("Rien à facturer pour l'instant")
    expect(html).toContain('Le montant se construit avec ce qu’elle déclare'.replace('’', "'"))
    expect(html).not.toContain('>Émettre le relevé<')
  })

  it('rappelle le dernier relevé émis, et laisse rouvrir son PDF', () => {
    const html = rendre(
      {},
      boutique,
      aFacturer({ dernier_numero: 'REL-2026-001', dernier_emis_le: '2026-09-20T08:00:00+00:00' }),
      [
        {
          id: 'r1',
          numero: 'REL-2026-001',
          emis_le: '2026-09-20T08:00:00+00:00',
          periode_debut: '2026-09-18',
          periode_fin: '2026-09-18',
          total_ventes: 88,
          valeur_reprises: 32,
          nb_declarations: 1,
          pdf_path: 'u1/releves/releve-REL-2026-001.pdf',
        },
      ],
    )

    expect(html).toContain('dernier relevé : REL-2026-001')
    expect(html).toContain('Relevés émis')
    expect(html).toContain('REL-2026-001')
    expect(html).toContain('20/09/2026')
    expect(html).toContain('32 € de reprises, non facturées')
    expect(html).toContain('Ouvrir le PDF')
  })

  it('dit la vérité quand le PDF d’un relevé émis n’a pas été rangé', () => {
    const html = rendre({}, boutique, aFacturer(), [
      {
        id: 'r1',
        numero: 'REL-2026-002',
        emis_le: '2026-09-20T08:00:00+00:00',
        periode_debut: '2026-09-18',
        periode_fin: '2026-09-18',
        total_ventes: 56,
        valeur_reprises: 0,
        nb_declarations: 1,
        pdf_path: null,
      },
    ])

    expect(html).toContain("Le PDF n'a pas été rangé")
    expect(html).not.toContain('Ouvrir le PDF')
  })
})
