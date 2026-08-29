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
  notes: string | null
  status: ContentStatus
  reminder_at: string | null
  created_at: string
}

export type ContentEntryDraft = Omit<ContentEntry, 'id' | 'user_id' | 'created_at'>
