import { describe, expect, it } from 'vitest'
import { joursAvecCommande } from './calendrier'
import type { Commande } from './supabase'

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
