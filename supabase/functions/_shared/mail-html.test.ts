import { describe, expect, it } from 'vitest'
import { echapper, mailHtml } from './mail-html.ts'

describe('echapper', () => {
  it('neutralise ce qui pourrait sortir du cadre', () => {
    expect(echapper('<b>"x"</b> & \'y\'')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; &#39;y&#39;')
  })
})

describe('mailHtml', () => {
  const base = {
    expediteur: 'Au Coin du Feu',
    titre: 'Bon de dépôt',
    paragraphes: ['Trois bougies partent chez toi.', 'Le bon est en pièce jointe.'],
  }

  it('pose un cadre centré et une largeur fixe', () => {
    const html = mailHtml(base)
    expect(html).toContain('align="center"')
    expect(html).toContain('width="600"')
    expect(html).toContain('max-width:100%')
    expect(html).toContain('role="presentation"')
  })

  it('rend l’en-tête, le titre et les paragraphes', () => {
    const html = mailHtml(base)
    expect(html).toContain('Au Coin du Feu')
    expect(html).toContain('Bon de dépôt')
    expect(html).toContain('Trois bougies partent chez toi.')
  })

  it('met un bouton d’action quand il y en a un, et rien quand il n’y en a pas', () => {
    const avec = mailHtml({ ...base, cta: { libelle: 'Voir le bon', url: 'https://exemple.be/bon' } })
    expect(avec).toContain('Voir le bon')
    expect(avec).toContain('https://exemple.be/bon')
    expect(avec).toContain('ou copie ce lien')

    const sans = mailHtml(base)
    expect(sans).not.toContain('ou copie ce lien')
  })

  it('range les détails en tableau, et n’en pose aucun quand il n’y en a pas', () => {
    const html = mailHtml({ ...base, encadre: { lignes: [['Dépôt', 'Le Comptoir'], ['Pièces', '3']] } })
    expect(html).toContain('Dépôt')
    expect(html).toContain('Le Comptoir')
    expect(html).toContain('Pièces')
    expect(html).toContain('border-collapse:collapse')

    expect(mailHtml(base)).not.toContain('border-collapse:collapse')
  })

  it('échappe tout ce qui vient de la base', () => {
    const html = mailHtml({
      ...base,
      titre: '<script>alert(1)</script>',
      paragraphes: ['Boutique « Le Comptoir » & Cie'],
      encadre: { lignes: [["Nom d'usage", '<img src=x onerror=alert(1)>']] },
      cta: { libelle: 'Ouvrir', url: 'https://exemple.be/?a=1&b=2' },
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; Cie')
    // L'esperluette de l'URL survit en tant qu'entité : le lien reste correct.
    expect(html).toContain('https://exemple.be/?a=1&amp;b=2')
  })

  it('cache le résumé d’aperçu au lieu de le laisser dans le corps', () => {
    const html = mailHtml({ ...base, resume: 'Un bon de dépôt à signer' })
    expect(html).toContain('Un bon de dépôt à signer')
    expect(html).toContain('max-height:0')
    expect(html).toContain('display:none')
  })

  it('n’ajoute ni note ni pied quand il n’y en a pas', () => {
    const html = mailHtml(base)
    expect(html).not.toContain('word-break:break-all')
  })
})
