import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EspaceFournisseur from './EspaceFournisseur'

// L'écran est monté pour de vrai et on lit le HTML rendu. Ce qui compte ici : le signalement d'écart
// est offert sur CHAQUE bon, reçu ou pas (la boutique compte parfois après avoir confirmé), et le geste
// de confirmation reste réservé aux bons pas encore reçus. Les requêtes sont remplacées : ni base ni
// configuration pour ce banc d'essai.

const bon = (over: Record<string, unknown>) => ({
  bon_id: 'b1', numero: '2026-001', date: '2026-10-01', statut: 'envoye', confirme_le: null, mode: 'depot',
  pieces: 2, valeur: 30, lignes: [{ designation: 'Bougie', quantite: 2, prix: 15 }], ...over,
})

const { bons } = vi.hoisted(() => ({ bons: { data: [] as unknown[] } }))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a>,
  useParams: () => ({ partenaireId: 'p1' }),
}))

const mutation = { mutate: () => {}, isPending: false, isError: false, isSuccess: false, error: null }
vi.mock('../lib/compte-boutique', () => ({
  useEspaceBoutique: () => ({ data: { etat: { fournisseurs: [{ partenaire_id: 'p1', artisan: 'Atelier Lune', pieces: [] }] } } }),
  useEspaceBons: () => ({ data: bons.data, isLoading: false, error: null }),
  useConfirmerBon: () => mutation,
  useContesterBon: () => mutation,
}))

const rendu = () => renderToStaticMarkup(<EspaceFournisseur />)

describe('EspaceFournisseur — signaler un écart', () => {
  it('bon à confirmer : confirmer ET signaler un écart', () => {
    bons.data = [bon({})]
    const html = rendu()
    expect(html).toContain('Confirmer ce bon')
    expect(html).toContain('Signaler un écart')
  })

  it('bon déjà reçu : plus de confirmation, mais le signalement reste possible', () => {
    bons.data = [bon({ confirme_le: '2026-10-02T09:00:00Z' })]
    const html = rendu()
    expect(html).not.toContain('Confirmer ce bon')
    expect(html).toContain('Signaler un écart')
  })

  it('dépôt-vente : on propose de déclarer ses ventes ; achat ferme : on ne le propose pas', () => {
    bons.data = [bon({ mode: 'depot_vente' })]
    expect(rendu()).toContain('Déclarer mes ventes')
    bons.data = [bon({ mode: 'depot_vente' }), bon({ bon_id: 'b2', mode: 'achat_ferme' })]
    const html = rendu()
    expect(html).not.toContain('Déclarer mes ventes')
    // Le reste de l'écran ne bouge pas : historique et restant restent consultables.
    expect(html).toContain('Mes ventes déclarées à')
    expect(html).toContain('Ce qui te reste')
  })

  it('le formulaire reste fermé tant qu’on ne l’ouvre pas : pas de champ de texte, pas de délai affiché', () => {
    bons.data = [bon({})]
    const html = rendu()
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('tardif')
  })
})
