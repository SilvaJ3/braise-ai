import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EspaceDeclarer from './EspaceDeclarer'

// L'écran est monté pour de vrai et on lit le HTML rendu. Ce qui compte : une ligne par pièce en stock,
// à zéro vente ; rien d'envoyable tant que rien n'est saisi ; et, une fois l'envoi accepté, plus AUCUN
// champ ni bouton d'envoi — la base ajoute chaque envoi, un second compterait les ventes deux fois.
// Les requêtes sont remplacées : ni base ni configuration.

const piece = (cle: string, designation: string, reste: number, prix: number) => ({
  cle, produit_id: null, designation, prix, depose: reste, vendu: 0, repris: 0, entre: 0, reste, derniere_quantite: 0,
})

const { etat, envoi } = vi.hoisted(() => ({
  etat: { pieces: [] as unknown[] },
  envoi: { isSuccess: false, isPending: false, isError: false, error: null as Error | null, data: undefined as unknown, mutate: () => {} },
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a>,
  useParams: () => ({ partenaireId: 'p1' }),
}))

vi.mock('../lib/compte-boutique', () => ({
  useEspaceBoutique: () => ({
    isLoading: false,
    error: null,
    data: { erreur: null, etat: { fournisseurs: [{ partenaire_id: 'p1', artisan: 'Atelier Lune', pieces: etat.pieces }] } },
  }),
  useDeclarerVentes: () => envoi,
}))

vi.mock('./EspaceFournisseurReste', () => ({ Pas: () => <span data-pas /> }))

const rendu = () => renderToStaticMarkup(<EspaceDeclarer />)

describe('EspaceDeclarer', () => {
  it('une ligne par pièce en stock, rien d’envoyable tant que rien n’est saisi', () => {
    envoi.isSuccess = false
    etat.pieces = [piece('a', 'Bougie', 3, 15), piece('b', 'Savon', 0, 6), piece('c', 'Vase', 1, 40)]
    const html = rendu()
    expect(html).toContain('Bougie')
    expect(html).toContain('Vase')
    expect(html).not.toContain('Savon')
    expect(html.match(/data-pas/g)).toHaveLength(2)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Vérifier/)
  })

  it('aucune pièce en stock : phrase simple, pas de bouton', () => {
    envoi.isSuccess = false
    etat.pieces = []
    const html = rendu()
    expect(html).toContain('Rien à déclarer')
    expect(html).not.toContain('Vérifier')
  })

  it('après un envoi accepté : le montant, et plus aucun moyen d’envoyer une seconde fois', () => {
    envoi.isSuccess = true
    envoi.data = { facturable: 52.5, alerte: false }
    etat.pieces = [piece('a', 'Bougie', 3, 15)]
    const html = rendu()
    expect(html).toContain('52,50 €')
    expect(html).toContain('Voir mes ventes déclarées')
    expect(html).not.toContain('data-pas')
    expect(html).not.toMatch(/<button/)
    expect(html).not.toContain('Écart signalé')
  })

  it('un écart signalé par la base est dit après l’envoi', () => {
    envoi.isSuccess = true
    envoi.data = { facturable: 30, alerte: true }
    etat.pieces = [piece('a', 'Bougie', 3, 15)]
    expect(rendu()).toContain('Écart signalé')
    envoi.isSuccess = false
  })
})
