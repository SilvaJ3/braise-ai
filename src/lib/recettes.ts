import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type ProduitRecette } from './supabase'

const RECETTES_KEY = ['produit_recettes']

/** Toutes les recettes de l'utilisateur (BOM : matière + quantité par unité de produit). */
export function useRecettes() {
  return useQuery({
    queryKey: RECETTES_KEY,
    queryFn: async (): Promise<ProduitRecette[]> => {
      const { data, error } = await supabase.from('produit_recettes').select('*')
      if (error) throw error
      return (data as ProduitRecette[]).map((r) => ({ ...r, quantite: Number(r.quantite) }))
    },
  })
}

/** Ajoute ou met à jour la ligne matière d'un produit (une seule ligne par matière). */
export function useSaveRecetteLigne() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ligne: { produit_id: string; matiere_id: string; quantite: number }) => {
      const { error } = await supabase
        .from('produit_recettes')
        .upsert(ligne, { onConflict: 'produit_id,matiere_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RECETTES_KEY }),
  })
}

export function useDeleteRecetteLigne() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('produit_recettes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RECETTES_KEY }),
  })
}
