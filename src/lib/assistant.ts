import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type AssistantSuggestion } from './supabase'

export type ChatMsg = { role: 'user' | 'assistant'; content: string }

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

export async function askAssistant(
  messages: ChatMsg[],
): Promise<{ reply: string; added: number }> {
  const { data, error } = await supabase.functions.invoke('assistant', {
    body: { mode: 'chat', messages },
  })
  if (error) throw new Error(await errMessage(error))
  if (data?.error) throw new Error(data.error)
  return { reply: data.reply as string, added: (data.added as number) ?? 0 }
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
