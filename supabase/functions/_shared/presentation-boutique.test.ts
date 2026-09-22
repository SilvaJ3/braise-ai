import { describe, expect, it } from 'vitest'
import { construirePresentation, fautPresenter, objetPresentation } from './presentation-boutique'

const LIEN = 'https://www.braaise.io/boutique/jeton-de-demonstration'

function mail(over: Partial<Parameters<typeof construirePresentation>[0]> = {}) {
  return construirePresentation({
    artisan: 'Au Coin du Feu',
    boutique: 'Lära Concept Store',
    lien: LIEN,
    ...over,
  })
}

describe('fautPresenter', () => {
  it('présente une boutique qui a un lien et aucune trace d’envoi', () => {
    expect(fautPresenter(LIEN, null)).toBe(true)
    expect(fautPresenter(LIEN, undefined)).toBe(true)
  })

  it('ne présente jamais deux fois, ni une boutique sans lien à montrer', () => {
    expect(fautPresenter(LIEN, '2026-09-22T08:00:00.000Z')).toBe(false)
    expect(fautPresenter('', null)).toBe(false)
    expect(fautPresenter('   ', null)).toBe(false)
  })
})

describe('objetPresentation', () => {
  it('nomme l’artisan, et reste lisible sur un téléphone', () => {
    expect(objetPresentation('Au Coin du Feu')).toBe('Au Coin du Feu — à quoi sert le lien que vous avez reçu')
    expect(objetPresentation('  ')).toBe('À quoi sert le lien que vous avez reçu')
    for (const qui of ['Au Coin du Feu', '']) {
      expect(objetPresentation(qui).length).toBeLessThan(70)
    }
  })
})

describe('construirePresentation', () => {
  it('dit qui dépose, et ce que le lien permet', () => {
    const m = mail()
    expect(m.text).toContain('Au Coin du Feu dépose ses pièces chez Lära Concept Store')
    expect(m.text).toContain('Ce que vous y trouvez')
    expect(m.text).toContain('les pièces déposées et le bon qui les accompagne')
    expect(m.text).toContain("ce qu'il vous en reste d'après ce qui a été noté")
    expect(m.text).toContain('pour dire ce qui a été vendu')
    expect(m.text).toContain('les pièces reprises')
    expect(m.text).toContain('demander un réassort')
    expect(m.text).toContain('aucun compte à créer')
  })

  it('dit ce qu’on attend d’elle : une fois par mois, quelques minutes', () => {
    const m = mail()
    expect(m.text).toContain("Ce qu'on attend de vous : une fois par mois, quelques minutes")
    expect(m.text).toContain("Vous dites ce qu'il vous reste")
  })

  it('dit ce qui reste chez l’artisan, et le lien personnel', () => {
    const m = mail()
    expect(m.text).toContain("Ce qui reste chez l'artisan")
    expect(m.text).toContain("sa propriété jusqu'à la vente")
    expect(m.text).toContain('le bon signé reste la pièce qui compte')
    expect(m.text).toContain('Votre lien est personnel')
    expect(m.text).toContain('jamais son stock ni les autres boutiques')
  })

  it('le lien apparaît une seule fois, avec la phrase qui le fait garder', () => {
    const m = mail()
    expect(m.text.split(LIEN).length - 1).toBe(1)
    expect(m.text).toContain("C'est toujours la même adresse")
    expect(m.html).toContain(LIEN)
    expect(m.html).toContain('Ouvrir ma page')
    expect(m.html).toContain('Vos pièces, et votre lien')
  })

  it('sans lien exploitable, il ne promet pas un bouton mort', () => {
    const m = mail({ lien: '' })
    expect(m.text).not.toContain('http')
    expect(m.html).not.toContain('<a href')
    expect(m.text).toContain('répondez à ce mail')
  })

  it('ne promet rien que l’app ne fasse : les limites sont écrites', () => {
    const t = mail().text
    expect(t).toContain('ne tient pas votre caisse')
    expect(t).toContain('ne fait ni facture ni comptabilité')
    expect(t).toContain("c'est lui qui le valide")
    for (const interdit of [
      'gère ton stock',
      'logiciel de gestion',
      'ERP',
      'tout au même endroit',
      'abonnement',
      'gratuit',
      'bientôt',
      'prochainement',
    ]) {
      expect(t.toLowerCase()).not.toContain(interdit.toLowerCase())
    }
  })

  it('tient sur une page : un texte court, et pas de chiffre qui suppose un état', () => {
    const t = mail().text
    // Un écran de téléphone : au-delà, le mail n'est plus lu.
    expect(t.length).toBeLessThan(1800)
    expect(t.split('\n\n').length).toBeLessThanOrEqual(10)
    // Une présentation ne parle pas d'un mois, d'un relevé ni d'un montant : ce sont les rappels.
    expect(t).not.toMatch(/\b(19|20)\d{2}\b/)
    expect(t).not.toContain('€')
  })
})
