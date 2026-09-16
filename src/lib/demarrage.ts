import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { EtatDemarrage } from './demarrage-etapes'

// Accès aux données de la carte « Pour démarrer » : le calcul des étapes vit dans
// lib/demarrage-etapes.ts (testable sans réseau), ce fichier ne fait que compter et écrire.

export * from './demarrage-etapes'

/**
 * L'état du compte, en quatre comptages côté serveur (`head: true` : aucune ligne rapatriée) plus
 * les deux seules boutiques nécessaires pour savoir s'il y en a une ou plusieurs. L'écran d'accueil
 * se remonte à chaque retour sur l'onglet et chargeait déjà le catalogue et le planning en entier :
 * ces comptages remplacent ces deux lectures, ils ne s'y ajoutent pas.
 */
export function useEtatDemarrage(actif = true) {
  const boutiques = useQuery({
    queryKey: ['demarrage', 'boutiques'],
    enabled: actif,
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; nom: string }[]> => {
      const { data, error } = await supabase
        .from('boutiques')
        .select('id, nom')
        .order('nom')
        .limit(2)
      if (error) throw error
      return data as { id: string; nom: string }[]
    },
  })

  const produits = useQuery({
    queryKey: ['demarrage', 'produits'],
    enabled: actif,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('produits')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
  })

  const bons = useQuery({
    queryKey: ['demarrage', 'bons'],
    enabled: actif,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('depots')
        .select('id', { count: 'exact', head: true })
        .in('statut', ['signe', 'envoye'])
      if (error) throw error
      return count ?? 0
    },
  })

  const idees = useQuery({
    queryKey: ['demarrage', 'idees'],
    enabled: actif,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('content_entries')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
  })

  const liste = boutiques.data ?? []

  return {
    isLoading: boutiques.isLoading || produits.isLoading || bons.isLoading || idees.isLoading,
    etat: {
      boutiques: liste.length,
      boutiqueUnique: liste.length === 1 ? liste[0].id : null,
      produits: produits.data ?? 0,
      bons: bons.data ?? 0,
      idees: idees.data ?? 0,
    } satisfies EtatDemarrage,
  }
}

/** Masquer la carte : le refus est enregistré sur le compte, pas dans le navigateur. */
export function useFermerDemarrage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('assistant_profil')
        .upsert(
          { demarrage_ferme_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profil-compte'] }),
  })
}
