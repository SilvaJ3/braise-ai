import { describe, expect, it } from 'vitest'
import {
  detailLigne,
  mailBonConfirme,
  mailReassort,
  mailReleveEmis,
  mailStockMouvement,
  nbPieces,
  pushBonConfirme,
  pushReassort,
  pushReleveEmis,
  pushStockMouvement,
  resumeLignes,
  type BonConfirme,
  type Reassort,
  type ReleveEmis,
  type StockMouvement,
} from './notif-artisan'

const LIEN = 'https://braise-ai.vercel.app/depots/f0f0f0f0-0000-4000-8000-000000000001'

function bon(over: Partial<BonConfirme> = {}): BonConfirme {
  return {
    boutique: 'Lära Concept Store',
    numero: '2026-003',
    date_depot: '2026-09-19',
    confirme_le: '2026-09-26',
    lignes: [
      { designation: 'Bol', quantite: 6 },
      { designation: 'Plat', quantite: 2 },
      { designation: 'Tasse', quantite: 4 },
    ],
    ...over,
  }
}

function reassort(over: Partial<Reassort> = {}): Reassort {
  return {
    boutique: 'Lära Concept Store',
    echeance: '2026-10-10',
    lignes: [
      { designation: 'Bol', quantite: 6 },
      { designation: 'Plat', quantite: 2 },
    ],
    note: null,
    ...over,
  }
}

describe('resumeLignes', () => {
  it('compte les pièces et nomme ce qu’il y a, sans dépasser deux noms', () => {
    expect(nbPieces(bon().lignes)).toBe(12)
    expect(resumeLignes([{ designation: 'Bol', quantite: 6 }])).toBe('6 pièces (Bol)')
    expect(resumeLignes(reassort().lignes)).toBe('8 pièces (Bol et Plat)')
    expect(resumeLignes(bon().lignes)).toBe('12 pièces (Bol, Plat et 1 autre)')
    expect(resumeLignes([{ designation: 'Tasse', quantite: 1 }])).toBe('1 pièce (Tasse)')
  })
})

describe('detailLigne', () => {
  it('écrit la quantité devant la désignation, sans décimale inutile', () => {
    expect(detailLigne({ designation: 'Bol', quantite: 6 })).toBe('Bol × 6')
    expect(detailLigne({ designation: 'Théière', quantite: 2.5 })).toBe('Théière × 2,5')
  })
})

describe('le bon confirmé', () => {
  it('la notification dit la boutique, le bon et le nombre de pièces', () => {
    const p = pushBonConfirme(bon())
    expect(p.title).toBe('Lära Concept Store a reçu ton bon')
    expect(p.body).toBe('Bon 2026-003 — 12 pièces (Bol, Plat et 1 autre), confirmé le 26/09/2026.')
  })

  it('le mail nomme la confirmation comme ce qui fait foi, et porte chaque ligne', () => {
    const m = mailBonConfirme(bon(), { lien: LIEN })
    expect(m.subject).toBe('Lära Concept Store a confirmé la réception de ton bon 2026-003')
    expect(m.text).toContain('Bonjour,')
    expect(m.text).toContain('confirmé avoir reçu le bon 2026-003, déposé le 19 septembre 2026')
    expect(m.text).toContain('  Bol × 6')
    expect(m.text).toContain('  Tasse × 4')
    expect(m.text).toContain('12 pièces au total.')
    expect(m.text).toContain("C'est cette confirmation qui fait foi")
    expect(m.text).toContain(LIEN)
    // Les deux versions disent la même chose : le lecteur qui refuse le HTML ne perd rien.
    expect(m.html).toContain('Lära Concept Store a confirmé la réception')
    expect(m.html).toContain(LIEN)
    expect(m.html).toContain('Ouvrir le bon')
    expect(m.html).toContain('19 septembre 2026')
  })

  it('sans lien, le mail n’invente pas d’adresse', () => {
    const m = mailBonConfirme(bon(), { lien: '' })
    expect(m.text).not.toContain('http')
    expect(m.html).not.toContain('Ouvrir le bon')
  })
})

describe('le réassort', () => {
  it('la notification dit la quantité et le délai', () => {
    const p = pushReassort(reassort())
    expect(p.title).toBe('Lära Concept Store te demande un réassort')
    expect(p.body).toBe('8 pièces (Bol et Plat) — à préparer pour le 10/10/2026.')
  })

  it('le mail liste la demande et renvoie vers la commande', () => {
    const m = mailReassort(reassort(), { lien: LIEN })
    expect(m.subject).toBe('Lära Concept Store te demande un réassort')
    expect(m.text).toContain('Lära Concept Store te demande un réassort.')
    expect(m.text).toContain('  Bol × 6')
    expect(m.text).toContain('8 pièces au total, à préparer pour le 10 octobre 2026.')
    expect(m.text).toContain('au statut « Demande »')
    expect(m.text).toContain(LIEN)
    expect(m.html).toContain('Ouvrir la commande')
  })

  it('le mot de la boutique est repris tel quel quand il y en a un', () => {
    const m = mailReassort(reassort({ note: 'on arrive à court de bols' }), { lien: LIEN })
    expect(m.text).toContain('De sa part : « on arrive à court de bols »')
    expect(m.html).toContain('on arrive à court de bols')
    // Le mot vient d'un tiers : il ne doit jamais atterrir dans le HTML sans être échappé.
    const m2 = mailReassort(reassort({ note: '<script>alert(1)</script>' }), { lien: LIEN })
    expect(m2.html).not.toContain('<script>')
    expect(m2.html).toContain('&lt;script&gt;')
  })

  it('sans échéance, la phrase reste juste plutôt que de dire une date inventée', () => {
    const p = pushReassort(reassort({ echeance: '' }))
    expect(p.body).toBe('8 pièces (Bol et Plat).')
    const m = mailReassort(reassort({ echeance: '' }), { lien: LIEN })
    expect(m.text).toContain('8 pièces au total.')
    expect(m.html).not.toContain('À préparer pour')
  })
})

describe('le vocabulaire', () => {
  it('ces messages parlent d’artisans, jamais d’artisanes', () => {
    const textes = [
      pushBonConfirme(bon()).title + ' ' + pushBonConfirme(bon()).body,
      pushReassort(reassort()).title + ' ' + pushReassort(reassort()).body,
      mailBonConfirme(bon(), { lien: LIEN }).text,
      mailBonConfirme(bon(), { lien: LIEN }).html,
      mailReassort(reassort(), { lien: LIEN }).text,
      mailReassort(reassort(), { lien: LIEN }).html,
    ].join('\n')
    expect(textes).not.toMatch(/\bartisan(e|es)\b/i)
  })
})


// --- Le mouvement de stock ---------------------------------------------------------------------

function stock(over: Partial<StockMouvement> = {}): StockMouvement {
  return {
    boutique: 'Lära Concept Store',
    nb_lignes: 3,
    facturable: 402,
    periode: '2026-10',
    ...over,
  }
}

describe('pushStockMouvement', () => {
  it('dit la boutique, le nombre de lignes et le montant', () => {
    const p = pushStockMouvement(stock())
    expect(p.title).toBe('Lära Concept Store a déclaré des ventes')
    expect(p.body).toContain('3 lignes')
    expect(p.body).toContain('402 €')
  })

  it('accorde le singulier quand il n’y a qu’une ligne', () => {
    expect(pushStockMouvement(stock({ nb_lignes: 1 })).body).toContain('1 ligne —')
  })

  it('n’emploie aucun mot genré', () => {
    const p = pushStockMouvement(stock())
    expect(`${p.title} ${p.body}`).not.toMatch(/artisan(e|es)\b/)
  })
})

describe('mailStockMouvement', () => {
  it('porte le montant, la période et le lien', () => {
    const m = mailStockMouvement(stock(), { lien: LIEN })
    expect(m.subject).toContain('402 €')
    expect(m.subject).toContain('Lära Concept Store')
    expect(m.html).toContain('2026-10')
    expect(m.text).toContain(LIEN)
    expect(m.html).toContain('402 €')
  })

  it('dit que le relevé se génère depuis le compte', () => {
    expect(mailStockMouvement(stock(), { lien: '' }).text).toContain('relevé')
  })
})

describe('mouvement de stock — le message groupé (0090)', () => {
  it('une déclaration seule se lit au présent, comme avant', () => {
    const p = pushStockMouvement(stock({ declarations: 1 }))
    expect(p.body).toContain('3 lignes —')
    expect(p.body).not.toContain('déclarations')
  })

  it('plusieurs déclarations se disent en une fois, avec le total', () => {
    const p = pushStockMouvement(stock({ declarations: 3, nb_lignes: 7, facturable: 402 }))
    expect(p.body).toContain('3 déclarations')
    expect(p.body).toContain('7 lignes au total')
    expect(p.body).toContain('402 €')
  })

  it('le mail dit combien de déclarations il regroupe, et le récapitulatif le porte', () => {
    const m = mailStockMouvement(stock({ declarations: 4, nb_lignes: 9 }), { lien: LIEN })
    expect(m.text).toContain('en 4 fois')
    expect(m.text).toContain('9 lignes au total')
    expect(m.html).toContain('Déclarations regroupées')
    expect(m.html).toContain('9')
  })

  it('une déclaration seule ne parle pas de regroupement', () => {
    const m = mailStockMouvement(stock(), { lien: '' })
    expect(m.text).not.toContain('en 1 fois')
    expect(m.html).not.toContain('regroupées')
  })

  it('n’emploie aucun mot genré, groupé ou non', () => {
    const m = mailStockMouvement(stock({ declarations: 2 }), { lien: '' })
    expect(`${m.subject} ${m.text}`).not.toMatch(/artisan(e|es)\b/)
  })
})

// --- Le relevé émis ----------------------------------------------------------------------------

function releve(over: Partial<ReleveEmis> = {}): ReleveEmis {
  return {
    boutique: 'Lära Concept Store',
    numero: 'REL-2026-004',
    periode_debut: '2026-09-01',
    periode_fin: '2026-09-30',
    total_ventes: 402,
    nb_declarations: 2,
    ...over,
  }
}

describe('pushReleveEmis', () => {
  it('annonce le relevé et son montant', () => {
    const p = pushReleveEmis(releve())
    expect(p.title).toContain('Lära Concept Store')
    expect(p.title).toContain('relevé')
    expect(p.body).toContain('REL-2026-004')
    expect(p.body).toContain('402 €')
  })
})

describe('mailReleveEmis', () => {
  it('donne la période en clair, du … au …', () => {
    const m = mailReleveEmis(releve(), { lien: LIEN })
    expect(m.text).toContain('1 septembre 2026')
    expect(m.text).toContain('30 septembre 2026')
    expect(m.subject).toContain('REL-2026-004')
    expect(m.subject).toContain('402 €')
    expect(m.html).toContain(LIEN)
  })

  it('rappelle que le document est figé', () => {
    expect(mailReleveEmis(releve(), { lien: '' }).text).toContain('figé')
  })

  it('accorde le pluriel des déclarations', () => {
    expect(mailReleveEmis(releve({ nb_declarations: 1 }), { lien: '' }).text).toContain('1 déclaration')
    expect(mailReleveEmis(releve({ nb_declarations: 3 }), { lien: '' }).text).toContain('3 déclarations')
  })
})
