import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EspaceAbonnement from './EspaceAbonnement'

// L'écran est monté pour de vrai et on lit le HTML rendu : ce qu'une boutique voit de son accès.
// Surtout ce qu'il NE montre PAS : pas de bouton de paiement (Stripe n'existe pas encore pour une
// boutique), pas de prix. La requête est remplacée : ce banc d'essai ne demande ni base ni configuration.

const { requete } = vi.hoisted(() => ({
  requete: { data: null as Record<string, unknown> | null, isLoading: false },
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a>,
}))

vi.mock('../lib/compte-boutique', () => ({ useMonAbonnementBoutique: () => requete }))

function rendu(data: Record<string, unknown> | null, isLoading = false) {
  requete.data = data
  requete.isLoading = isLoading
  return renderToStaticMarkup(<EspaceAbonnement />)
}

describe('EspaceAbonnement', () => {
  it('accès offert : badge, date, promesse de ne rien prélever sans accord', () => {
    const html = rendu({ statut: 'offert', acces_offert_jusqu_au: '2999-01-20' })
    expect(html).toContain('Accès offert')
    expect(html).toContain('20 janvier 2999')
    expect(html).toContain('Rien n’est prélevé sans ton accord')
  })

  it('ne propose aucun geste de paiement et ne cite aucun prix', () => {
    for (const data of [{ statut: 'offert', acces_offert_jusqu_au: '2999-01-20' }, { statut: 'actif', fin: '2999-01-20' }, { statut: 'aucun' }]) {
      const html = rendu(data)
      expect(html).not.toMatch(/<button/)
      expect(html).not.toMatch(/€|S’abonner|Gérer/)
    }
  })

  it('rien à afficher : phrase simple, lien de retour conservé', () => {
    const html = rendu(null)
    expect(html).toContain('Aucun abonnement à afficher')
    expect(html).toContain('href="/espace-boutique"')
  })

  it('chargement', () => {
    expect(rendu(null, true)).toContain('Chargement')
  })
})
