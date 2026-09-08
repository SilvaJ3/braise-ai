import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCommandes, useToutesLignesCommande } from './commandes'
import { useRecettes } from './recettes'
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

// --- Besoin en matière première pour les commandes en cours --------------------------------
// Pas un inventaire : juste "il faut combien, chez qui la commander", calculé à la volée à
// partir des commandes actives (demande/confirmée/en prod) et des recettes (BOM) des produits
// commandés. Une ligne de commande marquée « déjà en stock » sort du calcul.

export type BesoinMatiere = {
  matiere: MatierePremiere
  besoin: number
  disponible: number
  aCommander: number
  fournisseur: Fournisseur | null
  nbCommandes: number
}

export function useBesoinsMatiere() {
  const { data: commandes = [], isLoading: l1 } = useCommandes()
  const { data: lignes = [], isLoading: l2 } = useToutesLignesCommande()
  const { data: recettes = [], isLoading: l3 } = useRecettes()
  const { data: matieres = [], isLoading: l4 } = useMatieres()
  const { data: fournisseurs = [], isLoading: l5 } = useFournisseurs()

  const data = useMemo(() => {
    const commandesActives = new Set(
      commandes.filter((c) => !c.archived_at && c.statut !== 'livree').map((c) => c.id),
    )
    const recettesParProduit = new Map<string, { matiere_id: string; quantite: number }[]>()
    for (const r of recettes) {
      const arr = recettesParProduit.get(r.produit_id) ?? []
      arr.push(r)
      recettesParProduit.set(r.produit_id, arr)
    }

    const parMatiere = new Map<string, { qte: number; commandeIds: Set<string> }>()
    for (const l of lignes) {
      if (l.deja_en_stock || !l.produit_id || !commandesActives.has(l.commande_id)) continue
      for (const r of recettesParProduit.get(l.produit_id) ?? []) {
        const cur = parMatiere.get(r.matiere_id) ?? { qte: 0, commandeIds: new Set<string>() }
        cur.qte += Number(l.quantite) * r.quantite
        cur.commandeIds.add(l.commande_id)
        parMatiere.set(r.matiere_id, cur)
      }
    }

    const fournisseurById = new Map(fournisseurs.map((f) => [f.id, f]))
    const besoins: BesoinMatiere[] = []
    for (const [matiereId, { qte, commandeIds }] of parMatiere) {
      const m = matieres.find((x) => x.id === matiereId)
      if (!m) continue
      const aCommander = Math.max(0, qte - m.stock_actuel)
      if (aCommander <= 0) continue
      besoins.push({
        matiere: m,
        besoin: qte,
        disponible: m.stock_actuel,
        aCommander,
        fournisseur: m.fournisseur_id ? fournisseurById.get(m.fournisseur_id) ?? null : null,
        nbCommandes: commandeIds.size,
      })
    }
    besoins.sort((a, b) => a.matiere.nom.localeCompare(b.matiere.nom))
    return besoins
  }, [commandes, lignes, recettes, matieres, fournisseurs])

  return { data, isLoading: l1 || l2 || l3 || l4 || l5 }
}
