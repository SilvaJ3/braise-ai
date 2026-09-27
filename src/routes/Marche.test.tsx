import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Marche from './Marche'

// L'écran est monté pour de vrai et on lit le HTML rendu : ce qui compte ici est ce que l'artisan
// voit au marché — l'article qui manque demande un nom ET un prix, et l'app dit où il atterrit.
// Les données et les requêtes sont remplacées (lib/marches importe le client Supabase, qui exige
// des variables d'environnement) : ce banc d'essai ne demande ni base, ni configuration.

const { etat } = vi.hoisted(() => ({
  etat: { statut: 'ouvert' as string },
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'm-1' }),
  useNavigate: () => () => {},
}))

vi.mock('../lib/produits', () => ({
  useProduits: () => ({ data: [] }),
}))

vi.mock('../lib/marches', () => ({
  useMarche: () => ({
    isLoading: false,
    data: {
      marche: { id: 'm-1', nom: 'Marché de Noël', lieu: 'Liège', date_marche: '2026-12-12', statut: etat.statut },
      lignes: [],
    },
  }),
  useVendreProduit: () => ({ mutate: () => {} }),
  useAjusterLigne: () => ({ mutate: () => {} }),
  useNoteLigne: () => ({ mutate: () => {} }),
  useAjouterProduitMarche: () => ({ mutate: () => {}, isPending: false }),
  useClonturerMarche: () => ({ mutate: () => {}, isPending: false }),
}))

function rendre() {
  return renderToStaticMarkup(<Marche />)
}

describe('Marche — l’article qui manque à la liste', () => {
  beforeEach(() => {
    etat.statut = 'ouvert'
  })

  it('demande un prix, en plus du nom', () => {
    const html = rendre()
    expect(html).toContain('Un article qui manque à ta liste ?')
    expect(html).toContain('aria-label="Prix de vente"')
    expect(html).toContain('placeholder="Nom de l&#x27;article"')
  })

  it('dit où va l’article ajouté', () => {
    expect(rendre()).toContain('Il rejoint aussi tes produits, au même prix.')
  })

  it('n’ajoute rien tant que le nom et le prix ne sont pas là', () => {
    // Le bouton est inerte au départ : un article au marché sans prix faussait le total.
    const html = rendre()
    const bouton = html.slice(html.indexOf('>Ajouter</button>') - 400, html.indexOf('>Ajouter</button>'))
    expect(bouton).toContain('disabled')
  })

  it('n’offre plus la saisie sur un marché clôturé', () => {
    etat.statut = 'cloture'
    const html = rendre()
    expect(html).not.toContain('Un article qui manque à ta liste ?')
    expect(html).not.toContain('aria-label="Prix de vente"')
  })
})
