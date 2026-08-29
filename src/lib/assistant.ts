import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type AssistantSuggestion, type ChatMessage } from './supabase'

async function errMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return body.error
    } catch {
      /* ignore */
    }
  }
  return (error as Error).message
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
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ChatMessage[]
    },
    // Tant qu'une réponse est en cours, on rafraîchit toutes les 2,5 s.
    refetchInterval: (query) =>
      (query.state.data as ChatMessage[] | undefined)?.some((m) => m.status === 'pending')
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
