import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EspaceAbonnement from './EspaceAbonnement'

// L'écran est monté pour de vrai et on lit le HTML rendu : ce qu'une boutique voit de son accès.
// Deux choses comptent : (1) interrupteur de paiement ÉTEINT = aucun bouton, aucun prix (le paiement n'est
// pas livré) ; (2) interrupteur ALLUMÉ = les bons gestes selon l'état, et toujours aucun prix.
// Les requêtes sont remplacées : ce banc d'essai ne demande ni base ni configuration.

const { requete, reglage } = vi.hoisted(() => ({
  requete: { data: null as Record<string, unknown> | null, isLoading: false },
  reglage: { ouvert: false, retour: '' },
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a>,
  useSearchParams: () => [new URLSearchParams(reglage.retour ? `paiement=${reglage.retour}` : '')],
}))

const mutation = { mutate: () => {}, isPending: false, isSuccess: false, isError: false, error: null, data: undefined }
vi.mock('../lib/compte-boutique', () => ({
  useMonAbonnementBoutique: () => requete,
  usePaiementBoutiqueOuvert: () => reglage.ouvert,
  useOuvrirPaiementBoutique: () => mutation,
  useOuvrirPortailBoutique: () => mutation,
}))

function rendu(data: Record<string, unknown> | null, { ouvert = false, retour = '', isLoading = false } = {}) {
  requete.data = data
  requete.isLoading = isLoading
  reglage.ouvert = ouvert
  reglage.retour = retour
  return renderToStaticMarkup(<EspaceAbonnement />)
}

const OFFERT = { statut: 'offert', acces_offert_jusqu_au: '2999-01-20' }

describe('EspaceAbonnement', () => {
  it('accès offert : badge, date, promesse de ne rien prélever sans accord', () => {
    const html = rendu(OFFERT)
    expect(html).toContain('Accès offert')
    expect(html).toContain('20 janvier 2999')
    expect(html).toContain('Rien n’est prélevé sans ton accord')
  })

  it('interrupteur ÉTEINT : aucun bouton de paiement, aucun prix, quel que soit l’état', () => {
    for (const data of [OFFERT, { statut: 'actif', fin: '2999-01-20' }, { statut: 'aucun' }]) {
      const html = rendu(data)
      expect(html).not.toMatch(/<button/)
      expect(html).not.toMatch(/€|S’abonner|Gérer/)
    }
  })

  it('interrupteur ALLUMÉ, accès offert : on propose de s’abonner au mois ou à l’année, jours offerts gardés', () => {
    const html = rendu(OFFERT, { ouvert: true })
    expect(html).toContain('S’abonner au mois')
    expect(html).toContain('S’abonner à l’année')
    expect(html).toContain('tu gardes tes jours offerts')
    expect(html).not.toContain('Gérer mon abonnement')
  })

  it('interrupteur ALLUMÉ, abonnement actif : on propose de GÉRER, pas de s’abonner une seconde fois', () => {
    const html = rendu({ statut: 'actif', fin: '2999-01-20' }, { ouvert: true })
    expect(html).toContain('Gérer mon abonnement')
    expect(html).not.toContain('S’abonner')
  })

  it('interrupteur ALLUMÉ, aucun abonnement : on propose de s’abonner, pas de gérer', () => {
    const html = rendu({ statut: 'aucun' }, { ouvert: true })
    expect(html).toContain('S’abonner au mois')
    expect(html).not.toContain('Gérer mon abonnement')
  })

  it('même interrupteur allumé, aucun prix n’est écrit : il s’affiche sur la page de paiement', () => {
    for (const data of [OFFERT, { statut: 'actif', fin: '2999-01-20' }, { statut: 'aucun' }, { statut: 'resilie', fin: '2000-01-01' }]) {
      expect(rendu(data, { ouvert: true })).not.toMatch(/€/)
    }
    expect(rendu(OFFERT, { ouvert: true })).toContain('Le prix s’affiche sur la page de paiement')
  })

  it('le retour de la page de paiement est dit en une phrase', () => {
    expect(rendu(OFFERT, { retour: 'offert' })).toContain('Tes jours offerts sont gardés')
    expect(rendu({ statut: 'aucun' }, { retour: 'ok' })).toContain('Paiement reçu')
    expect(rendu({ statut: 'aucun' }, { retour: 'annule' })).toContain('rien n’a été prélevé')
    expect(rendu({ statut: 'aucun' }, { retour: 'inconnu' })).not.toContain('role="status"')
  })

  it('rien à afficher : phrase simple, lien de retour conservé', () => {
    const html = rendu(null)
    expect(html).toContain('Aucun abonnement à afficher')
    expect(html).toContain('href="/espace-boutique"')
  })

  it('chargement', () => {
    expect(rendu(null, { isLoading: true })).toContain('Chargement')
  })
})
