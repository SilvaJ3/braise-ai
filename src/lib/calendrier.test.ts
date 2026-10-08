import { describe, expect, it } from 'vitest'
import { joursAvecCommande, joursAvecReassort, joursMarques, pastillesDuJour } from './calendrier'
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

describe('joursAvecCommande — les siennes', () => {
  it('marque le jour de l’échéance d’une commande de client', () => {
    expect([...joursAvecCommande([commande({ type: 'personne', boutique_id: null })])]).toEqual(['2026-09-18'])
  })

  it('dédoublonne plusieurs commandes le même jour', () => {
    const jours = joursAvecCommande([
      commande({ id: 'a', type: 'personne' }),
      commande({ id: 'b', type: 'personne', statut: 'en_prod' }),
    ])
    expect([...jours]).toEqual(['2026-09-18'])
  })

  it('ignore une commande livrée ou archivée', () => {
    const jours = joursAvecCommande([
      commande({ id: 'a', type: 'personne', statut: 'livree' }),
      commande({ id: 'b', type: 'personne', archived_at: '2026-09-10T10:00:00Z' }),
      commande({ id: 'c', type: 'personne', date_echeance: '2026-09-21' }),
    ])
    expect([...jours]).toEqual(['2026-09-21'])
  })

  it('laisse les réassorts de boutique à leur propre famille', () => {
    expect(joursAvecCommande([commande({ type: 'boutique' })]).size).toBe(0)
  })

  it('ne produit rien sans commande', () => {
    expect(joursAvecCommande([]).size).toBe(0)
  })
})

describe('joursAvecReassort — celles des boutiques', () => {
  it('marque l’échéance d’une demande de boutique', () => {
    expect([...joursAvecReassort([commande({ type: 'boutique' })])]).toEqual(['2026-09-18'])
  })

  it('ignore une demande livrée ou archivée, et les commandes de clients', () => {
    const jours = joursAvecReassort([
      commande({ id: 'a', type: 'boutique', statut: 'livree' }),
      commande({ id: 'b', type: 'boutique', archived_at: '2026-09-10T10:00:00Z' }),
      commande({ id: 'c', type: 'personne' }),
      commande({ id: 'd', type: 'boutique', date_echeance: '2026-09-24' }),
    ])
    expect([...jours]).toEqual(['2026-09-24'])
  })

  it('les deux familles ne se recouvrent jamais', () => {
    const m = joursMarques([commande({ type: 'boutique' }), commande({ id: 'p', type: 'personne' })])
    expect([...m.reassort]).toEqual(['2026-09-18'])
    expect([...m.commandes]).toEqual(['2026-09-18'])
  })
})

describe('pastillesDuJour', () => {
  const j = (commandes: string[] = [], reassort: string[] = []) => ({
    commandes: new Set(commandes),
    reassort: new Set(reassort),
  })

  it('rien du tout : pas de pastille', () => {
    expect(pastillesDuJour([], j(), '2026-09-18')).toEqual([])
  })

  it('du contenu à faire : pastille creuse', () => {
    const p = pastillesDuJour([entree('a', '2026-09-18', 'planifie')], j(), '2026-09-18')
    expect(p).toEqual([{ famille: 'contenu', creux: true }])
  })

  it('du contenu tout publié : pastille pleine', () => {
    const p = pastillesDuJour(
      [entree('a', '2026-09-18', 'publie'), entree('b', '2026-09-18', 'publie')],
      j(),
      '2026-09-18',
    )
    expect(p).toEqual([{ famille: 'contenu', creux: false }])
  })

  it('un mélange le même jour reste « à faire »', () => {
    const p = pastillesDuJour(
      [entree('a', '2026-09-18', 'publie'), entree('b', '2026-09-18', 'a_faire')],
      j(),
      '2026-09-18',
    )
    expect(p).toEqual([{ famille: 'contenu', creux: true }])
  })

  it('contenu et commande le même jour : deux pastilles, dans cet ordre', () => {
    const p = pastillesDuJour([entree('a', '2026-09-18', 'publie')], j(['2026-09-18']), '2026-09-18')
    expect(p).toEqual([
      { famille: 'contenu', creux: false },
      { famille: 'commande', creux: false },
    ])
  })

  it('une échéance de commande seule marque le jour', () => {
    expect(pastillesDuJour([], j(['2026-09-22']), '2026-09-22')).toEqual([
      { famille: 'commande', creux: false },
    ])
  })

  it('un réassort de boutique a sa propre pastille, et passe avant la commande', () => {
    const p = pastillesDuJour([], j(['2026-09-22'], ['2026-09-22']), '2026-09-22')
    expect(p).toEqual([
      { famille: 'reassort', creux: false },
      { famille: 'commande', creux: false },
    ])
  })

  it('ignore les entrées des autres jours et les idées sans date', () => {
    const p = pastillesDuJour(
      [entree('a', '2026-09-19', 'planifie'), entree('b', null, 'idee')],
      j(),
      '2026-09-18',
    )
    expect(p).toEqual([])
  })
})
