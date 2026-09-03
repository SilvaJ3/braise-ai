import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  supabase,
  type Fournisseur,
  type FournisseurDraft,
  type MatierePremiere,
  type MatierePremiereDraft,
} from './supabase'

export const FOURNISSEURS_KEY = ['fournisseurs']
export const MATIERES_KEY = ['matieres_premieres']

export function useFournisseurs() {
  return useQuery({
    queryKey: FOURNISSEURS_KEY,
    queryFn: async (): Promise<Fournisseur[]> => {
      const { data, error } = await supabase.from('fournisseurs').select('*').order('nom')
      if (error) throw error
      return data as Fournisseur[]
    },
  })
}

export function useCreateFournisseur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: FournisseurDraft) => {
      const { error } = await supabase.from('fournisseurs').insert(draft)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FOURNISSEURS_KEY }),
  })
}

export function useUpdateFournisseur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<FournisseurDraft> }) => {
      const { error } = await supabase.from('fournisseurs').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FOURNISSEURS_KEY }),
  })
}

export function useDeleteFournisseur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fournisseurs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FOURNISSEURS_KEY })
      qc.invalidateQueries({ queryKey: MATIERES_KEY }) // fournisseur_id passe à null
    },
  })
}

export function useMatieres() {
  return useQuery({
    queryKey: MATIERES_KEY,
    queryFn: async (): Promise<MatierePremiere[]> => {
      const { data, error } = await supabase.from('matieres_premieres').select('*').order('nom')
      if (error) throw error
      // numeric → number (PostgREST renvoie déjà des nombres, mais on sécurise)
      return (data as MatierePremiere[]).map((m) => ({
        ...m,
        stock_actuel: Number(m.stock_actuel),
        seuil_alerte: m.seuil_alerte == null ? null : Number(m.seuil_alerte),
        prix_unitaire: m.prix_unitaire == null ? null : Number(m.prix_unitaire),
      }))
    },
  })
}

export function useCreateMatiere() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: MatierePremiereDraft) => {
      const { error } = await supabase.from('matieres_premieres').insert(draft)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MATIERES_KEY }),
  })
}

export function useUpdateMatiere() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MatierePremiereDraft> }) => {
      const { error } = await supabase.from('matieres_premieres').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MATIERES_KEY }),
  })
}

export function useDeleteMatiere() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('matieres_premieres').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MATIERES_KEY }),
  })
}

export const UNITE_LABEL: Record<MatierePremiere['unite'], string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  piece: 'pc',
  m: 'm',
}

export const CATEGORIE_LABEL: Record<NonNullable<MatierePremiere['categorie']>, string> = {
  cire: 'Cire',
  meche: 'Mèche',
  parfum: 'Parfum',
  contenant: 'Contenant',
  colorant: 'Colorant',
  emballage: 'Emballage',
  autre: 'Autre',
}

export function fmtQty(n: number, unite: MatierePremiere['unite']): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
  return `${v} ${UNITE_LABEL[unite]}`
}

export function sousSeuil(m: MatierePremiere): boolean {
  return m.seuil_alerte != null && m.stock_actuel <= m.seuil_alerte
}
