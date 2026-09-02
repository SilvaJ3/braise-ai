import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants (voir .env.example)')
}

export const supabase = createClient(url, key)

export type ContentStatus = 'idee' | 'a_faire' | 'planifie' | 'publie'
export type ContentType = 'post' | 'story' | 'reel'
export type Platform = 'instagram' | 'facebook' | 'tiktok'

export type ContentEntry = {
  id: string
  user_id: string
  title: string
  product: string | null
  type: ContentType | null
  platform: Platform | null
  date: string | null
  scheduled_time: string | null
  reminder_lead_hours: number | null
  notes: string | null
  status: ContentStatus
  reminder_at: string | null
  reminder_sent_at: string | null
  source: 'manuel' | 'assistant'
  perf: 'carton' | 'ok' | 'bof' | null
  boutique_id: string | null
  created_at: string
}

export type Saison = 'toute_annee' | 'printemps' | 'ete' | 'automne' | 'hiver' | 'noel'

export type Produit = {
  id: string
  user_id: string
  nom: string
  senteur: string | null
  description: string | null
  prix_vente: number | null
  saison: Saison | null
  actif: boolean
  created_at: string
}

export type ProduitDraft = Omit<Produit, 'id' | 'user_id' | 'created_at'>

export type AssistantSuggestion = {
  id: string
  user_id: string
  type: 'idee_contenu' | 'observation' | 'relance_boutique'
  message: string
  source_id: string | null
  boutique_id: string | null
  statut: 'nouveau' | 'vu' | 'traite'
  created_at: string
}

export type CanalContact = 'email' | 'telephone' | 'instagram' | 'visite' | 'autre'

export type Boutique = {
  id: string
  user_id: string
  nom: string
  adresse: string | null
  horaires: Record<string, string> | null
  canal_prefere: CanalContact | null
  email: string | null
  telephone: string | null
  notes: string | null
  actif: boolean
  lat: number | null
  lng: number | null
  created_at: string
}

export type BoutiqueDraft = Omit<Boutique, 'id' | 'user_id' | 'created_at'>

export type BoutiqueContactLog = {
  id: string
  user_id: string
  boutique_id: string
  date: string
  canal: CanalContact | null
  resume: string | null
  created_at: string
}

export type BoutiqueContactLogDraft = Omit<
  BoutiqueContactLog,
  'id' | 'user_id' | 'created_at'
>

export type ContentEntryDraft = Omit<
  ContentEntry,
  'id' | 'user_id' | 'created_at' | 'source' | 'reminder_sent_at' | 'perf'
>

export type ChatMessage = {
  id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  status: 'pending' | 'done' | 'error'
  meta: { added?: number }
  created_at: string
}
