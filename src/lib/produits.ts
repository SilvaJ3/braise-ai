import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Produit, type ProduitDraft } from './supabase'

const KEY = ['produits']

export function useProduits() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Produit[]> => {
      const { data, error } = await supabase.from('produits').select('*').order('nom')
      if (error) throw error
      return data as Produit[]
    },
  })
}

export function useCreateProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: ProduitDraft) => {
      const { error } = await supabase.from('produits').insert(draft)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ProduitDraft> }) => {
      const { error } = await supabase.from('produits').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('produits').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

// --- Profil de marque (1 ligne) ---

export function useProfil() {
  return useQuery({
    queryKey: ['assistant_profil'],
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('assistant_profil')
        .select('contenu')
        .maybeSingle()
      if (error) throw error
      return data?.contenu ?? ''
    },
  })
}

export function useSaveProfil() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (contenu: string) => {
      const { error } = await supabase
        .from('assistant_profil')
        .upsert({ contenu, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistant_profil'] }),
  })
}
