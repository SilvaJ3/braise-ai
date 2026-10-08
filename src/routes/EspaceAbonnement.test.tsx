import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EspaceAbonnement from './EspaceAbonnement'
import { PRIX_BOUTIQUE } from '../lib/abonnement-boutique'

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
    // Le prix se lit AVANT de cliquer (décision JSB du 07/10/2026) — et il est hors TVA, comme partout.
    expect(html).toContain(PRIX_BOUTIQUE.mensuel)
    expect(html).toContain('490 € HTVA par an')
    expect(html).toContain('la TVA de ton pays s’ajoute au paiement')
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

  it('le prix est écrit à l’écran dès qu’on propose de s’abonner (décision JSB du 07/10/2026)', () => {
    // On propose de s'abonner dans trois cas : accès offert, aucun abonnement, abonnement terminé.
    // La boutique doit savoir ce qu'elle paie AVANT d'ouvrir une page de paiement.
    for (const data of [OFFERT, { statut: 'aucun' }, { statut: 'resilie', fin: '2000-01-01' }]) {
      const html = rendu(data, { ouvert: true })
      expect(html).toContain(PRIX_BOUTIQUE.mensuel)
      expect(html).toContain('490 € HTVA par an')
      expect(html).toContain('la TVA de ton pays s’ajoute au paiement')
    }
    // Là où il n'y a rien à souscrire, aucun tarif ne traîne : un abonné actif ne voit pas de prix.
    for (const data of [{ statut: 'actif', fin: '2999-01-20' }, { statut: 'en_retard', fin: '2999-01-20' }]) {
      expect(rendu(data, { ouvert: true })).not.toMatch(/€/)
    }
    // Interrupteur éteint : pas de bouton, donc pas de prix non plus.
    expect(rendu(OFFERT, { ouvert: false })).not.toMatch(/€/)
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
