import { describe, expect, it } from 'vitest'
import { construireMailBon, LIBELLE_BOUTON } from './mail-bon'
import type { DepotDoc } from './depot-doc'

const JETON = '7f735717aa8bdc0cc994cb5c58d213c1e7bdaaaa75299275'
const LIEN = `https://www.braaise.io/boutique/${JETON}`

function doc(over: Partial<DepotDoc> = {}): DepotDoc {
  return {
    numero: '2026-009',
    date_depot: '2026-09-27',
    emetteur: {
      nom: 'Au Coin du Feu',
      adresse: 'Bruxelles',
      telephone: '0471469685',
      tva: '',
      email: 'hello@aucoindufeu-bougie.be',
      mention_signature: '',
    },
    mode: 'depot_vente',
    boutique_nom: 'Bouquinerie Simone',
    boutique_adresse: '75 Rue des Combattants, 1310 La Hulpe',
    boutique_email: 'info@bouquinerie-simone.be',
    lignes: [
      { designation: 'Bougie citrouille', quantite: 3, prix_unitaire: 35 },
      { designation: 'Bougie fleur', quantite: 3, prix_unitaire: 25 },
    ],
    notes: null,
    signataire_nom: 'Stéphanie Velenduc',
    signature_image: null,
    photo_image: null,
    ...over,
  }
}

describe('construireMailBon', () => {
  it('pose un vrai lien cliquable quand la boutique a une adresse', () => {
    const m = construireMailBon(doc(), { lien: LIEN })
    // Le défaut constaté le 27/09 : le mail partait sans version mise en page, donc le lien
    // au jeton arrivait en texte mort. C'est cette balise qui manquait.
    expect(m.html).toContain(`<a href="${LIEN}"`)
    expect(m.html).toContain(LIBELLE_BOUTON)
    // Le lien est aussi écrit en clair sous le bouton — et cliquable lui aussi : si le bouton est
    // rogné par le client, cette deuxième ligne reste un lien (et non du texte à recopier).
    const ancres = m.html.match(/<a href="https:\/\/www\.braaise\.io\/boutique\//g) ?? []
    expect(m.html).toContain(LIEN)
    expect(ancres).toHaveLength(2)
  })

  it('garde la version brute, avec le lien entier sur une seule ligne', () => {
    const m = construireMailBon(doc(), { lien: LIEN })
    const lignes = m.text.split('\n')
    const porteur = lignes.filter((l) => l.includes('/boutique/'))
    expect(porteur).toHaveLength(1)
    // Un lien coupé par un retour à la ligne n'est plus reconnu par le lecteur de messages.
    expect(porteur[0].trim()).toBe(LIEN)
  })

  it('donne l’objet, les articles et le total du bon', () => {
    const m = construireMailBon(doc(), { lien: LIEN })
    expect(m.subject).toBe('Bon de dépôt n° 2026-009 — Au Coin du Feu — 27/09/2026')
    expect(m.html).toContain('Bougie citrouille — 3 × 35 €')
    expect(m.html).toContain('Bougie fleur — 3 × 25 €')
    expect(m.html).toContain('180 €')
    expect(m.html).toContain('Bouquinerie Simone')
  })

  it('ne met aucun bouton quand il n’y a pas de lien — et le dit', () => {
    const m = construireMailBon(doc(), { lien: '' })
    expect(m.html).not.toContain('<a href=')
    expect(m.html).not.toContain(LIBELLE_BOUTON)
    expect(m.html).toContain('adresse de votre page est en train d')
    expect(m.text).not.toContain('/boutique/')
  })

  it('échappe ce qui vient de la base ou d’une saisie', () => {
    const m = construireMailBon(doc({ boutique_nom: '<script>alert(1)</script>' }), { lien: LIEN })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('dit « livrés » et « total livré » en achat ferme', () => {
    const m = construireMailBon(doc({ mode: 'achat_ferme', numero: '2026-010' }), { lien: LIEN })
    expect(m.html).toContain('Bon de livraison n° 2026-010')
    expect(m.html).toContain('Articles livrés')
    expect(m.html).toContain('Total livré (prix de vente TTC)')
  })
})
