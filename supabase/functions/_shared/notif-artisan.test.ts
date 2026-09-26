import { describe, expect, it } from 'vitest'
import {
  detailLigne,
  mailBonConfirme,
  mailReassort,
  nbPieces,
  pushBonConfirme,
  pushReassort,
  resumeLignes,
  type BonConfirme,
  type Reassort,
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
