import { describe, expect, it } from 'vitest'
import { joursAvecCommande, pastillesDuJour } from './calendrier'
import type { Commande, ContentEntry } from './supabase'

const entry: ContentEntry = {
  id: 'e0',
  user_id: 'u1',
  title: 'Publication',
  product: null,
  type: 'post',
  platform: 'instagram',
  date: '2026-09-18',
  scheduled_time: null,
  reminder_lead_hours: null,
  notes: null,
  status: 'planifie',
  source: 'manuel',
  perf: null,
  reminder_sent_at: null,
  reminder_at: null,
  boutique_id: null,
  created_at: '2026-09-01T10:00:00Z',
}

const entree = (id: string, date: string | null, status: ContentEntry['status']): ContentEntry => ({
  ...entry,
  id,
  date,
  status,
})

const commande = (over: Partial<Commande> = {}): Commande => ({
  id: 'c1',
  user_id: 'u1',
  type: 'boutique',
  boutique_id: 'b1',
  client_nom: null,
  client_telephone: null,
  client_email: null,
  date_echeance: '2026-09-18',
  statut: 'confirmee',
  notes: null,
  archived_at: null,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  ...over,
})

describe('joursAvecCommande', () => {
  it('marque le jour de l’échéance', () => {
    expect([...joursAvecCommande([commande()])]).toEqual(['2026-09-18'])
  })

  it('dédoublonne plusieurs commandes le même jour', () => {
    const jours = joursAvecCommande([
      commande({ id: 'a' }),
      commande({ id: 'b', statut: 'en_prod' }),
    ])
    expect([...jours]).toEqual(['2026-09-18'])
  })

  it('ignore une commande livrée ou archivée', () => {
    const jours = joursAvecCommande([
      commande({ id: 'a', statut: 'livree' }),
      commande({ id: 'b', archived_at: '2026-09-10T10:00:00Z' }),
      commande({ id: 'c', date_echeance: '2026-09-21' }),
    ])
    expect([...jours]).toEqual(['2026-09-21'])
  })

  it('ne produit rien sans commande', () => {
    expect(joursAvecCommande([]).size).toBe(0)
  })
})

describe('pastillesDuJour', () => {
  it('rien du tout : pas de pastille', () => {
    expect(pastillesDuJour([], new Set(), '2026-09-18')).toEqual([])
  })

  it('du contenu à faire : pastille creuse', () => {
    const p = pastillesDuJour([entree('a', '2026-09-18', 'planifie')], new Set(), '2026-09-18')
    expect(p).toEqual([{ famille: 'contenu', creux: true }])
  })

  it('du contenu tout publié : pastille pleine', () => {
    const p = pastillesDuJour(
      [entree('a', '2026-09-18', 'publie'), entree('b', '2026-09-18', 'publie')],
      new Set(),
      '2026-09-18',
    )
    expect(p).toEqual([{ famille: 'contenu', creux: false }])
  })

  it('un mélange le même jour reste « à faire »', () => {
    const p = pastillesDuJour(
      [entree('a', '2026-09-18', 'publie'), entree('b', '2026-09-18', 'a_faire')],
      new Set(),
      '2026-09-18',
    )
    expect(p).toEqual([{ famille: 'contenu', creux: true }])
  })

  it('contenu et commande le même jour : deux pastilles, dans cet ordre', () => {
    const p = pastillesDuJour(
      [entree('a', '2026-09-18', 'publie')],
      new Set(['2026-09-18']),
      '2026-09-18',
    )
    expect(p).toEqual([
      { famille: 'contenu', creux: false },
      { famille: 'commande', creux: false },
    ])
  })

  it('une échéance de commande seule marque le jour', () => {
    expect(pastillesDuJour([], new Set(['2026-09-22']), '2026-09-22')).toEqual([
      { famille: 'commande', creux: false },
    ])
  })

  it('ignore les entrées des autres jours et les idées sans date', () => {
    const p = pastillesDuJour(
      [entree('a', '2026-09-19', 'planifie'), entree('b', null, 'idee')],
      new Set(),
      '2026-09-18',
    )
    expect(p).toEqual([])
  })
})
