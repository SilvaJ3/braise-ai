import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MATIERES_KEY } from './atelier'
import { COMMANDES_KEY } from './commandes'
import {
  supabase,
  type CommandeFournisseur,
  type CommandeFournisseurLigneRow,
  type CommandeFournisseurStatut,
} from './supabase'

const COMMANDES_FOURNISSEUR_KEY = ['commandes_fournisseur']

export const CF_STATUT_LABEL: Record<CommandeFournisseurStatut, string> = {
  a_commander: 'À commander',
  commandee: 'Commandée',
  recue: 'Reçue',
}

export const CF_STATUT_ORDER: CommandeFournisseurStatut[] = ['a_commander', 'commandee', 'recue']

export function nextCfStatut(s: CommandeFournisseurStatut): CommandeFournisseurStatut {
  const i = CF_STATUT_ORDER.indexOf(s)
  return CF_STATUT_ORDER[Math.min(i + 1, CF_STATUT_ORDER.length - 1)]
}

export function useCommandesFournisseur() {
  return useQuery({
    queryKey: COMMANDES_FOURNISSEUR_KEY,
    queryFn: async (): Promise<CommandeFournisseur[]> => {
      const { data, error } = await supabase
        .from('commandes_fournisseur')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as CommandeFournisseur[]
    },
  })
}

export function useCommandeFournisseur(id: string | undefined) {
  return useQuery({
    queryKey: [...COMMANDES_FOURNISSEUR_KEY, 'une', id ?? ''],
    enabled: !!id,
    queryFn: async (): Promise<{ commande: CommandeFournisseur; lignes: CommandeFournisseurLigneRow[] } | null> => {
      const { data, error } = await supabase.from('commandes_fournisseur').select('*').eq('id', id as string).maybeSingle()
      if (error) throw error
      if (!data) return null
      const { data: lignes, error: e2 } = await supabase
        .from('commande_fournisseur_lignes')
        .select('*')
        .eq('commande_fournisseur_id', id as string)
        .order('position')
      if (e2) throw e2
      return { commande: data as CommandeFournisseur, lignes: (lignes ?? []) as CommandeFournisseurLigneRow[] }
    },
  })
}

/** Crée une commande fournisseur pré-remplie depuis le besoin calculé (Atelier → À commander) :
 * une ligne par matière, quantité = ce qui manque à ce moment-là. */
export function useCreerCommandeFournisseurDepuisBesoin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      fournisseurId,
      lignes,
    }: {
      fournisseurId: string
      lignes: Array<{ matiere_id: string; quantite: number }>
    }) => {
      const { data, error } = await supabase
        .from('commandes_fournisseur')
        .insert({ fournisseur_id: fournisseurId })
        .select('id')
        .single()
      if (error) throw error
      const id = data.id as string
      const { error: e2 } = await supabase.from('commande_fournisseur_lignes').insert(
        lignes.map((l, i) => ({ commande_fournisseur_id: id, matiere_id: l.matiere_id, quantite: l.quantite, position: i })),
      )
      if (e2) throw e2
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMANDES_FOURNISSEUR_KEY }),
  })
}

/** Change le statut. Le passage à « reçue » incrémente le stock des matières (trigger DB) : on
 * invalide aussi les matières pour que l'écran Atelier reflète le nouveau stock. */
export function useChangerStatutCommandeFournisseur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: CommandeFournisseurStatut }) => {
      const patch: { statut: CommandeFournisseurStatut; date_commande?: string; date_reception?: string } = { statut }
      const today = new Date().toISOString().slice(0, 10)
      if (statut === 'commandee') patch.date_commande = today
      if (statut === 'recue') patch.date_reception = today
      const { error } = await supabase.from('commandes_fournisseur').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { statut }) => {
      qc.invalidateQueries({ queryKey: COMMANDES_FOURNISSEUR_KEY })
      if (statut === 'recue') {
        qc.invalidateQueries({ queryKey: MATIERES_KEY })
        qc.invalidateQueries({ queryKey: COMMANDES_KEY }) // le besoin recalculé dépend du stock
      }
    },
  })
}

export function useArchiverCommandeFournisseur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, archiver }: { id: string; archiver: boolean }) => {
      const { error } = await supabase
        .from('commandes_fournisseur')
        .update({ archived_at: archiver ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMANDES_FOURNISSEUR_KEY }),
  })
}

export function useDeleteCommandeFournisseur() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('commandes_fournisseur').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMANDES_FOURNISSEUR_KEY }),
  })
}
