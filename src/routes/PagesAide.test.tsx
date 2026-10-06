import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import FooterLegal from '../components/FooterLegal'
import PageLegale from './PageLegale'
import PremiersPas from './PremiersPas'

// Les trois écrans sont montés pour de vrai et on lit le HTML rendu : ce qui compte est ce que
// la personne a sous les yeux — les sections dans l'ordre, les liens qui mènent quelque part, et
// le bandeau « provisoire » tant que l'identité de l'éditeur n'est pas remplie. Aucune base, aucun
// navigateur : ces pages ne dépendent que de leur texte.

const rendre = (noeud: ReactNode) => renderToStaticMarkup(<MemoryRouter>{noeud}</MemoryRouter>)

describe('les pages légales', () => {
  it('les conditions affichent leurs sections dans l’ordre du document', () => {
    const html = rendre(<PageLegale document="conditions" />)
    expect(html).toContain('<h1>Conditions générales</h1>')
    expect(html.indexOf('Ce que Braaise fait')).toBeLessThan(
      html.indexOf('Ce que Braaise ne fait pas'),
    )
    expect(html.indexOf('Ce que Braaise ne fait pas')).toBeLessThan(html.indexOf('Résilier'))
    expect(html).toContain('Abonnement, prix et TVA')
    expect(html).toContain('Le bon de dépôt et la signature')
  })

  it('les conditions disent les limites du produit, en clair', () => {
    const html = rendre(<PageLegale document="conditions" />)
    expect(html).toContain('ni comptabilité, ni factures, ni TVA')
    expect(html).toContain('indication, jamais une garantie')
  })

  it('la confidentialité distingue le responsable du sous-traitant', () => {
    const html = rendre(<PageLegale document="confidentialite" />)
    expect(html).toContain('<h1>Confidentialité</h1>')
    expect(html).toContain('sous-traitant')
    expect(html).toContain('clauses contractuelles types')
    expect(html).toContain('Anthropic')
  })

  // Garde-fou : tant qu'un crochet subsiste dans le texte, la page le dit. Le jour où le bloc
  // identité est rempli, ce test tombe — c'est le signal qu'il faut retirer le bandeau.
  it('affiche le bandeau provisoire tant qu’il reste des crochets', () => {
    for (const document of ['conditions', 'confidentialite', 'mentions'] as const) {
      expect(rendre(<PageLegale document={document} />)).toContain('Version provisoire')
    }
  })

  it('les mentions légales s’affichent et le pied de page y mène', () => {
    const html = rendre(<PageLegale document="mentions" />)
    expect(html).toContain('<h1>Mentions légales</h1>')
    expect(html).toContain('Éditeur du site')
    expect(html).toContain('Hébergement')
    expect(rendre(<FooterLegal />)).toContain('href="/mentions-legales"')
  })

  it('aucune des trois ne parle des artisanes', () => {
    for (const document of ['conditions', 'confidentialite', 'mentions'] as const) {
      expect(rendre(<PageLegale document={document} />)).not.toMatch(/artisanes?\b/i)
    }
  })
})

describe('Premiers pas', () => {
  const html = rendre(<PremiersPas />)

  it('donne l’ordre de départ et mène aux bons écrans', () => {
    expect(html).toContain('Par où commencer')
    expect(html.indexOf('1. Une boutique')).toBeLessThan(html.indexOf('2. Tes produits'))
    expect(html.indexOf('2. Tes produits')).toBeLessThan(html.indexOf('3. Ton premier bon'))
    expect(html).toContain('href="/boutiques"')
    expect(html).toContain('href="/atelier"')
    expect(html).toContain('href="/assistant"')
  })

  it('renvoie vers le guide du téléphone plutôt que de le refaire', () => {
    expect(html).toContain('href="/compte/telephone"')
    expect(html).toContain('Installer Braaise')
  })

  it('redit les limites du produit sur la page d’aide aussi', () => {
    expect(html).toContain('Ce que Braaise ne fait pas')
    expect(html).toContain('jamais une')
  })

  it('ne parle pas des artisanes', () => {
    expect(html).not.toMatch(/artisanes?\b/i)
  })
})
