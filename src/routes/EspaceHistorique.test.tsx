import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EspaceHistorique from './EspaceHistorique'

// L'écran est monté pour de vrai et on lit le HTML rendu : ce que la boutique lit de ses ventes
// déclarées — des totaux par mois, un statut quand la base le donne, et jamais de détail pièce par
// pièce (la base n'en rend pas). Les requêtes sont remplacées : ni base ni configuration.

const { requete } = vi.hoisted(() => ({
  requete: { data: [] as unknown[], isLoading: false, error: null as Error | null },
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a>,
  useParams: () => ({ partenaireId: 'p1' }),
}))

vi.mock('../lib/compte-boutique', () => ({
  useEspaceBoutique: () => ({ data: { etat: { fournisseurs: [{ partenaire_id: 'p1', artisan: 'Atelier Lune' }] } } }),
  useEspaceHistorique: () => requete,
}))

const rendu = () => renderToStaticMarkup(<EspaceHistorique />)

describe('EspaceHistorique', () => {
  it('une ligne par déclaration : mois, montant, ventes, reprises, date et statut', () => {
    requete.data = [
      { declaration: '2026-09-28', ventes: 4, reprises: 1, facturable: 52.5, statut: 'validee' },
      { declaration: '2026-08-30', ventes: 1, reprises: 0, facturable: 15, statut: null },
    ]
    const html = rendu()
    expect(html).toContain('septembre 2026')
    expect(html).toContain('52,50 €')
    expect(html).toContain('4 vendues, 1 reprise')
    expect(html).toContain('déclaré le 28/09/2026')
    expect(html).toContain('Validé par l&#x27;artisan')
    expect(html).toContain('1 vendue')
    expect(html).not.toContain('1 vendues')
  })

  it('n’invente aucun statut quand la base n’en donne pas, ni aucun détail par pièce', () => {
    requete.data = [{ declaration: '2026-08-30', ventes: 1, reprises: 0, facturable: 15, statut: null }]
    const html = rendu()
    expect(html).not.toContain('badge')
    expect(html).not.toMatch(/<button/)
  })

  it('aucune déclaration : phrase simple', () => {
    requete.data = []
    expect(rendu()).toContain('Aucune vente déclarée pour l')
  })

  it('douze déclarations : dit que les plus anciennes ne sont pas affichées', () => {
    requete.data = Array.from({ length: 12 }, (_, i) => ({ declaration: `2026-0${(i % 9) + 1}-10`, ventes: 1, reprises: 0, facturable: 10, statut: null }))
    expect(rendu()).toContain('plus anciennes')
  })

  it('un refus de la base s’affiche, et le lien de retour mène à l’artisan', () => {
    requete.data = []
    requete.error = new Error("Cet artisan n'est plus rattaché à ta boutique.")
    const html = rendu()
    expect(html).toContain('plus rattaché')
    expect(html).toContain('href="/espace-boutique/fournisseur/p1"')
    requete.error = null
  })
})
