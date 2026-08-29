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
      const { error } = await supabase.from('content_entries').update(patch).eq('id', id)
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
