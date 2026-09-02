import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { functionErrorMessage as errMessage } from './push'
import { supabase, type AssistantSuggestion, type ChatMessage } from './supabase'

export const MAX_MESSAGE_CHARS = 4000 // même limite que l'edge function
const HISTORY_LIMIT = 100
// Au-delà, une réponse « pending » est considérée plantée : l'edge function la clôt en
// erreur au prochain envoi, et le client ne bloque plus la saisie.
export const PENDING_STALE_MS = 5 * 60_000

export function isPendingActive(m: ChatMessage, now = Date.now()): boolean {
  return m.status === 'pending' && now - new Date(m.created_at).getTime() < PENDING_STALE_MS
}

// Envoie une question. La réponse est générée en arrière-plan côté serveur (edge function
// + EdgeRuntime.waitUntil) : on récupère juste l'id de la réponse en attente, puis on
// suit son statut via useChatMessages. Push envoyé à l'utilisateur quand c'est prêt.
export async function sendChatMessage(message: string): Promise<{ pending_id: string }> {
  const { data, error } = await supabase.functions.invoke('assistant', {
    body: { mode: 'chat', message },
  })
  if (error) throw new Error(await errMessage(error))
  if (data?.error) throw new Error(data.error)
  return data as { pending_id: string }
}

export function useChatMessages() {
  return useQuery({
    queryKey: ['chat_messages'],
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT)
      if (error) throw error
      return (data as ChatMessage[]).reverse()
    },
    // Tant qu'une réponse est en cours (et pas plantée), on rafraîchit toutes les 2,5 s.
    refetchInterval: (query) =>
      (query.state.data as ChatMessage[] | undefined)?.some((m) => isPendingActive(m))
        ? 2500
        : false,
  })
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => sendChatMessage(message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat_messages'] }),
  })
}

export function useSuggestions() {
  return useQuery({
    queryKey: ['assistant_suggestions'],
    queryFn: async (): Promise<AssistantSuggestion[]> => {
      const { data, error } = await supabase
        .from('assistant_suggestions')
        .select('*')
        .eq('statut', 'nouveau')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as AssistantSuggestion[]
    },
  })
}

export function useMarkSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: 'nouveau' | 'vu' | 'traite' }) => {
      const { error } = await supabase
        .from('assistant_suggestions')
        .update({ statut })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistant_suggestions'] }),
  })
}

export function useGenerateIdeas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<{ ideas_inserted: number; observations: number }> => {
      const { data, error } = await supabase.functions.invoke('assistant', {
        body: { mode: 'weekly' },
      })
      if (error) throw new Error(await errMessage(error))
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assistant_suggestions'] })
      qc.invalidateQueries({ queryKey: ['content_entries'] })
    },
  })
}
