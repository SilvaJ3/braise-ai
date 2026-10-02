import { describe, expect, it } from 'vitest'
import { CONFIDENTIALITE, CONDITIONS } from '../content/legal'
import { aCompleter, blocs, estProvisoire, sections, titreDocument } from './texte-legal'

describe('blocs', () => {
  it('reconnaît les trois formes et ignore le vide', () => {
    const b = blocs('## Un titre\n\nUn paragraphe.\n- une puce\n- une autre\n')
    expect(b).toEqual([
      { type: 'titre', texte: 'Un titre' },
      { type: 'para', texte: 'Un paragraphe.' },
      { type: 'point', texte: 'une puce' },
      { type: 'point', texte: 'une autre' },
    ])
  })

  it('ne rend pas de bloc vide sur des lignes blanches', () => {
    expect(blocs('\n\n   \n')).toEqual([])
  })
})

describe('sections', () => {
  it('range les blocs sous leur titre, dans l’ordre', () => {
    const s = sections('## A\np1\n- x\n## B\np2')
    expect(s.map((x) => x.titre)).toEqual(['A', 'B'])
    expect(s[0].blocs.map((b) => b.type)).toEqual(['para', 'point'])
    expect(s[1].blocs[0]).toEqual({ type: 'para', texte: 'p2' })
  })

  it('ouvre une section sans titre si le texte commence par un paragraphe', () => {
    const s = sections('p1\n## A\np2')
    expect(s[0].titre).toBeNull()
    expect(s[0].blocs[0].texte).toBe('p1')
  })
})

// Les deux pages sont des documents qu'un artisan peut opposer à l'éditeur : ce qui est vérifié
// ici, c'est qu'ils tiennent la route (sections présentes, puces intactes), pas leur rédaction.
describe('les textes légaux', () => {
  const attendusConditions = [
    'Ce que Braaise fait',
    'Ce que Braaise ne fait pas',
    'Abonnement, prix et TVA',
    'Résilier',
    'Le bon de dépôt et la signature',
    'Responsabilité',
    'Réclamations et droit applicable',
    'Éditeur',
  ]
  for (const titre of attendusConditions) {
    it(`les conditions portent la section « ${titre} »`, () => {
      expect(CONDITIONS).toContain(`## ${titre}`)
    })
  }

  it('les conditions disent ce que le produit ne fait pas, en puces', () => {
    const interdits = blocs(CONDITIONS).filter((b) => b.type === 'point')
    expect(interdits.length).toBeGreaterThanOrEqual(4)
    expect(interdits.map((b) => b.texte).join(' ')).toMatch(/comptabilité/)
  })

  it('la confidentialité distingue le responsable du sous-traitant', () => {
    expect(CONFIDENTIALITE).toContain('responsable de traitement')
    expect(CONFIDENTIALITE).toContain('sous-traitant')
    expect(CONFIDENTIALITE).toContain('clauses contractuelles types')
  })

  it('les deux textes sont en français et ne parlent pas des artisanes', () => {
    for (const texte of [CONDITIONS, CONFIDENTIALITE]) {
      expect(texte).not.toMatch(/\bartisanes?\b/i)
    }
  })

  // Garde-fou de publication : le bloc identité est rempli depuis le 29/09/2026 (nom, statut, siège,
  // numéro d'entreprise, TVA, contact). Il ne reste que la date de mise à jour, à poser au moment de
  // publier — c'est elle qui maintient le bandeau provisoire, et qui le fera disparaître.
  it('ne laisse en crochets que la date de mise à jour', () => {
    expect(aCompleter(CONDITIONS + CONFIDENTIALITE)).toEqual(['[DATE]'])
    expect(estProvisoire(CONDITIONS)).toBe(true)
    expect(estProvisoire(CONFIDENTIALITE)).toBe(true)
  })

  // Le jour où ces lignes changent, c'est que l'identité publiée a bougé : à relire avant publication.
  it('publie l’identité de l’éditeur en clair', () => {
    expect(CONDITIONS).toContain('Junior Silva Braga Almeida')
    expect(CONDITIONS).toContain('1043.060.596')
    expect(CONDITIONS).toContain('BE 1043.060.596')
    expect(CONDITIONS).toContain('contact@braaise.io')
    expect(CONDITIONS).toContain('390 € HTVA par an')
    expect(CONFIDENTIALITE).toContain('Rue Cardinal Lavigerie 7, 1040 Etterbeek')
  })

  // Le numéro d'entreprise et le numéro de TVA sont ACTIFS depuis le 02/10/2026 (confirmation de
  // JSB) : l'abonnement se facture donc avec 21 % de TVA belge, au régime normal. Le test garde les
  // deux sens — la réserve ne doit plus être là, et le taux facturé doit être écrit.
  it('dit l’immatriculation et la TVA actives, au taux appliqué', () => {
    expect(CONDITIONS).not.toContain('immatriculation en cours')
    expect(CONDITIONS).not.toContain('pas encore active')
    expect(CONFIDENTIALITE).not.toContain('immatriculation en cours')
    expect(CONFIDENTIALITE).not.toContain('pas encore active')
    expect(CONDITIONS).not.toContain("aucun montant de TVA n'est")
    expect(CONDITIONS).toContain('21 %')
  })

  it('a un titre de document lisible', () => {
    expect(titreDocument(CONFIDENTIALITE)).toBe('En une phrase')
  })
})
