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

  // Garde-fou de publication : ces deux pages ne peuvent pas partir en ligne avec des crochets.
  // Le jour où le bloc identité est rempli, ces deux tests tombent d'eux-mêmes — c'est le signal
  // qu'il reste à les supprimer, en même temps que le bandeau de la page.
  it('porte encore ce qu’il faut compléter (identité, contact, délai)', () => {
    const manquants = aCompleter(CONDITIONS + CONFIDENTIALITE)
    expect(manquants).toContain('[ADRESSE DE CONTACT]')
    expect(estProvisoire(CONDITIONS)).toBe(true)
    expect(estProvisoire(CONFIDENTIALITE)).toBe(true)
  })

  it('a un titre de document lisible', () => {
    expect(titreDocument(CONFIDENTIALITE)).toBe('En une phrase')
  })
})
