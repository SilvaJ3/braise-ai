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
  created_at: string
}

export type AssistantSuggestion = {
  id: string
  user_id: string
  type: 'idee_contenu' | 'observation'
  message: string
  source_id: string | null
  statut: 'nouveau' | 'vu' | 'traite'
  created_at: string
}

export type ContentEntryDraft = Omit<
  ContentEntry,
  'id' | 'user_id' | 'created_at' | 'source' | 'reminder_sent_at'
>
