import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  supabase,
  type Boutique,
  type BoutiqueContactLog,
  type BoutiqueContactLogDraft,
  type BoutiqueDraft,
} from './supabase'

const KEY = ['boutiques']

export function useBoutiques() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Boutique[]> => {
      const { data, error } = await supabase.from('boutiques').select('*').order('nom')
      if (error) throw error
      return data as Boutique[]
    },
  })
}

export function useCreateBoutique() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: BoutiqueDraft) => {
      const { error } = await supabase.from('boutiques').insert(draft)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateBoutique() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BoutiqueDraft> }) => {
      const { error } = await supabase.from('boutiques').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteBoutique() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('boutiques').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

// --- Log de contact (par boutique) ---

const contactsKey = (boutiqueId: string) => ['boutique_contacts_log', boutiqueId]

export function useBoutiqueContacts(boutiqueId: string | null) {
  return useQuery({
    queryKey: contactsKey(boutiqueId ?? ''),
    enabled: !!boutiqueId,
    queryFn: async (): Promise<BoutiqueContactLog[]> => {
      const { data, error } = await supabase
        .from('boutique_contacts_log')
        .select('*')
        .eq('boutique_id', boutiqueId as string)
        .order('date', { ascending: false })
      if (error) throw error
      return data as BoutiqueContactLog[]
    },
  })
}

export function useLogContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: BoutiqueContactLogDraft) => {
      const { error } = await supabase.from('boutique_contacts_log').insert(draft)
      if (error) throw error
    },
    onSuccess: (_data, draft) =>
      qc.invalidateQueries({ queryKey: contactsKey(draft.boutique_id) }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; boutiqueId: string }) => {
      const { error } = await supabase.from('boutique_contacts_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { boutiqueId }) =>
      qc.invalidateQueries({ queryKey: contactsKey(boutiqueId) }),
  })
}

// Dernier contact par boutique, pour l'affichage liste ("pas de contact depuis X").
export function useLastContacts() {
  return useQuery({
    queryKey: ['boutique_contacts_log', 'last_by_boutique'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('boutique_contacts_log')
        .select('boutique_id, date')
        .order('date', { ascending: false })
      if (error) throw error
      const last: Record<string, string> = {}
      for (const row of data ?? []) {
        if (!last[row.boutique_id]) last[row.boutique_id] = row.date
      }
      return last
    },
  })
}
