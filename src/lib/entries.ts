import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type ContentEntry, type ContentEntryDraft } from './supabase'

const KEY = ['content_entries']

export function useEntries() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ContentEntry[]> => {
      const { data, error } = await supabase
        .from('content_entries')
        .select('*')
        .order('date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ContentEntry[]
    },
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: ContentEntryDraft) => {
      const { error } = await supabase.from('content_entries').insert(draft)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ContentEntryDraft> }) => {
      // rappel modifié -> autorise un nouvel envoi
      const body = 'reminder_at' in patch ? { ...patch, reminder_sent_at: null } : patch
      const { error } = await supabase.from('content_entries').update(body).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useSetPerf() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, perf }: { id: string; perf: 'carton' | 'ok' | 'bof' }) => {
      const { error } = await supabase.from('content_entries').update({ perf }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('content_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
