import { supabase } from './supabase'

// Fire-and-forget : ne bloque jamais l'UI, avale les erreurs.
export function logEvent(name: string, meta?: Record<string, unknown>) {
  supabase
    .from('app_events')
    .insert({ name, meta: meta ?? null })
    .then(undefined, () => {})
}
