import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

const REGLAGES_KEY = ['reglages']

// Réglage par défaut : synchro produits <-> matières premières activée (comportement
// historique). Les profils sans gestion de stock (illustratrices, etc.) la désactivent depuis
// Compte → Notifications : plus d'alerte stock ni de rappel de commande fournisseur.
export function useReglages() {
  return useQuery({
    queryKey: REGLAGES_KEY,
    queryFn: async (): Promise<{ sync_produits_matieres: boolean }> => {
      const { data, error } = await supabase
        .from('reglages')
        .select('sync_produits_matieres')
        .maybeSingle()
      if (error) throw error
      return { sync_produits_matieres: data?.sync_produits_matieres ?? true }
    },
  })
}

export function useSaveReglages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: { sync_produits_matieres: boolean }) => {
      const { error } = await supabase
        .from('reglages')
        .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REGLAGES_KEY }),
  })
}
