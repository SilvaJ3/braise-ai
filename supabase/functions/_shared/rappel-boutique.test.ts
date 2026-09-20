import { describe, expect, it } from 'vitest'
import {
  construireRappel,
  phraseMouvements,
  signatureGroupee,
  typeRappelDuJour,
  type BoutiqueRappel,
  type PartenaireRappel,
} from './rappel-boutique'

const LIEN = 'https://braise-ai.vercel.app/boutique/?t=jeton-de-demonstration'

function partenaire(over: Partial<PartenaireRappel> = {}): PartenaireRappel {
  return {
    partenaire_id: 'p1',
    artisan: 'Au Coin du Feu',
    artisan_email: 'hello@aucoindufeu-bougie.be',
    ventes_mois: 2,
    reprises_mois: 1,
    entrees_mois: 0,
    restant: 2,
    declare_ce_mois: false,
    ...over,
  }
}

function boutique(over: Partial<BoutiqueRappel> = {}): BoutiqueRappel {
  return {
    lien_id: 'l1',
    email: 'contact@laboutique.be',
    jeton: 'jeton-de-demonstration',
    a_declarer: true,
    partenaires: [partenaire()],
    ...over,
  }
}

describe('typeRappelDuJour', () => {
  it('le 1er le point, le 5 la relance, les autres jours rien de neuf', () => {
    expect(typeRappelDuJour(1)).toBe('rappel')
    expect(typeRappelDuJour(5)).toBe('relance')
    for (const j of [2, 3, 4, 6, 15, 30, 31]) expect(typeRappelDuJour(j)).toBe(null)
  })
})

describe('phraseMouvements', () => {
  it('dit l’état réel, pas « un relevé est disponible »', () => {
    expect(phraseMouvements(partenaire(), '2026-08-01')).toBe(
      "2 vendues et 1 reprise en août 2026 ; il vous reste 2 pièces d'après nos comptes.",
    )
  })

  it('accorde les pluriels et se tait sur les zéros', () => {
    expect(phraseMouvements(partenaire({ ventes_mois: 1, reprises_mois: 0 }), '2026-08-01')).toContain(
      '1 vendue en août 2026',
    )
    expect(phraseMouvements(partenaire({ ventes_mois: 5, reprises_mois: 0 }), '2026-08-01')).toContain(
      '5 vendues en août 2026',
    )
    expect(phraseMouvements(partenaire({ ventes_mois: 3, reprises_mois: 2 }), '2026-08-01')).toContain(
      '3 vendues et 2 reprises en août 2026',
    )
    // Une reprise n'est jamais comptée comme une vente (0053).
    expect(phraseMouvements(partenaire({ ventes_mois: 0, reprises_mois: 2 }), '2026-08-01')).toContain(
      '2 reprises en août 2026',
    )
  })

  it('un mois sans mouvement le dit, et donne quand même le restant', () => {
    const p = partenaire({ ventes_mois: 0, reprises_mois: 0, entrees_mois: 0, restant: 6 })
    expect(phraseMouvements(p, '2026-08-01')).toBe(
      "rien de nouveau pour août 2026 ; il vous reste 6 pièces d'après nos comptes.",
    )
  })

  it('« restant » est une indication : la phrase ne promet jamais un stock juste', () => {
    const p = partenaire({ restant: 0 })
    expect(phraseMouvements(p, '2026-08-01')).toContain("d'après nos comptes")
  })
})

describe('signatureGroupee', () => {
  it('un artisan, deux, puis « et N autres »', () => {
    expect(signatureGroupee([partenaire()])).toBe('Au Coin du Feu')
    expect(signatureGroupee([partenaire(), partenaire({ artisan: 'La Cire Bleue' })])).toBe(
      'Au Coin du Feu et La Cire Bleue',
    )
    expect(
      signatureGroupee([partenaire(), partenaire({ artisan: 'B' }), partenaire({ artisan: 'C' })]),
    ).toBe('Au Coin du Feu et 2 autres')
    expect(signatureGroupee([])).toBe('')
  })
})

describe('construireRappel', () => {
  it('le rappel du 1er : les chiffres du mois écoulé, le lien, une seule fois', () => {
    const m = construireRappel({
      type: 'rappel',
      lien: LIEN,
      moisCourant: '2026-09-01',
      moisPrecedent: '2026-08-01',
      partenaires: [partenaire()],
    })
    expect(m.subject).toBe('Au Coin du Feu — où en sont vos pièces ?')
    expect(m.text).toContain("2 vendues et 1 reprise en août 2026 ; il vous reste 2 pièces d'après nos comptes")
    expect(m.text).toContain(LIEN)
    expect(m.text.split(LIEN).length - 1).toBe(1)
    expect(m.text).toContain('gardez-la')
    // La voix est celle de l'artisan, pas celle d'une plateforme.
    expect(m.text).toContain('Au Coin du Feu')
    expect(m.html).toContain(LIEN)
    expect(m.html).toContain('Où en sont vos pièces ?')
  })

  it('la relance du 5 : même état, ton plus direct, et le mois qui manque', () => {
    const m = construireRappel({
      type: 'relance',
      lien: LIEN,
      moisCourant: '2026-09-01',
      moisPrecedent: '2026-08-01',
      partenaires: [partenaire()],
    })
    expect(m.subject).toBe('Au Coin du Feu — il nous manque votre relevé de septembre')
    expect(m.text).toContain("Nous n'avons encore rien reçu pour septembre")
    expect(m.text).toContain("2 vendues et 1 reprise en août 2026")
    expect(m.text.split(LIEN).length - 1).toBe(1)
  })

  it('une ligne par artisan quand la boutique en a plusieurs', () => {
    const m = construireRappel({
      type: 'rappel',
      lien: LIEN,
      moisCourant: '2026-09-01',
      moisPrecedent: '2026-08-01',
      partenaires: [
        partenaire(),
        partenaire({ partenaire_id: 'p2', artisan: 'La Cire Bleue', ventes_mois: 0, reprises_mois: 0, restant: 5 }),
      ],
    })
    expect(m.text).toContain('Au Coin du Feu —')
    expect(m.text).toContain('La Cire Bleue —')
    expect(m.subject).toContain('Au Coin du Feu et La Cire Bleue')
  })

  it('sans lien exploitable, le mail part quand même — et ne promet pas un bouton mort', () => {
    const m = construireRappel({
      type: 'rappel',
      lien: '',
      moisCourant: '2026-09-01',
      moisPrecedent: '2026-08-01',
      partenaires: [partenaire()],
    })
    expect(m.text).not.toContain('http')
    expect(m.text).toContain('répondez à ce mail')
    expect(m.html).not.toContain('<a href')
  })

  it('n’écrit jamais « gère ton stock » ni un chiffre sans le mot qui le borne', () => {
    const m = construireRappel({
      type: 'rappel',
      lien: LIEN,
      moisCourant: '2026-09-01',
      moisPrecedent: '2026-08-01',
      partenaires: [partenaire()],
    })
    expect(m.text.toLowerCase()).not.toContain('gère ton stock')
    expect(m.text).not.toContain('logiciel de gestion')
  })
})

describe('boutique (forme brute)', () => {
  it('le destinataire n’est jamais dans le corps : il est dans l’enveloppe', () => {
    const b = boutique()
    const m = construireRappel({
      type: 'rappel',
      lien: LIEN,
      moisCourant: '2026-09-01',
      moisPrecedent: '2026-08-01',
      partenaires: b.partenaires,
    })
    expect(m.text).not.toContain(b.email)
  })
})
