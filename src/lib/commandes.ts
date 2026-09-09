import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  supabase,
  type Commande,
  type CommandeLigneRow,
  type CommandeStatut,
  type CommandeType,
} from './supabase'

export const COMMANDES_KEY = ['commandes']

export const STATUT_LABEL: Record<CommandeStatut, string> = {
  demande: 'Demande',
  confirmee: 'Confirmée',
  en_prod: 'En prod',
  livree: 'Livrée',
}

export const STATUT_ORDER: CommandeStatut[] = ['demande', 'confirmee', 'en_prod', 'livree']

export function nextStatut(s: CommandeStatut): CommandeStatut {
  const i = STATUT_ORDER.indexOf(s)
  return STATUT_ORDER[Math.min(i + 1, STATUT_ORDER.length - 1)]
}

export function useCommandes(boutiqueId?: string) {
  return useQuery({
    queryKey: [...COMMANDES_KEY, boutiqueId ?? 'toutes'],
    queryFn: async (): Promise<Commande[]> => {
      let q = supabase.from('commandes').select('*').order('date_echeance')
      if (boutiqueId) q = q.eq('boutique_id', boutiqueId)
      const { data, error } = await q
      if (error) throw error
      return data as Commande[]
    },
  })
}

export function useCommande(id: string | undefined) {
  return useQuery({
    queryKey: [...COMMANDES_KEY, 'une', id ?? ''],
    enabled: !!id,
    queryFn: async (): Promise<{ commande: Commande; lignes: CommandeLigneRow[] } | null> => {
      const { data, error } = await supabase.from('commandes').select('*').eq('id', id as string).maybeSingle()
      if (error) throw error
      if (!data) return null
      const { data: lignes, error: e2 } = await supabase
        .from('commande_lignes')
        .select('*')
        .eq('commande_id', id as string)
        .order('position')
      if (e2) throw e2
      return { commande: data as Commande, lignes: (lignes ?? []) as CommandeLigneRow[] }
    },
  })
}

/** Toutes les lignes de commande de l'utilisateur, tous statuts confondus — sert au calcul
 * du besoin en matière première (Atelier → À commander), pas à un écran dédié. */
export function useToutesLignesCommande() {
  return useQuery({
    queryKey: [...COMMANDES_KEY, 'lignes-toutes'],
    queryFn: async (): Promise<CommandeLigneRow[]> => {
      const { data, error } = await supabase.from('commande_lignes').select('*')
      if (error) throw error
      return data as CommandeLigneRow[]
    },
  })
}

export type CommandeSaisie = {
  id?: string
  type: CommandeType
  boutique_id: string | null
  client_nom: string | null
  client_telephone: string | null
  client_email: string | null
  date_echeance: string
  statut: CommandeStatut
  notes: string | null
  lignes: Array<{
    produit_id: string | null
    designation: string
    couleur: string | null
    quantite: number
    deja_en_stock: boolean
  }>
}

/** Crée ou met à jour le brouillon et remplace ses lignes. Renvoie l'id de la commande. */
export async function saveCommande(saisie: CommandeSaisie): Promise<string> {
  const entete = {
    type: saisie.type,
    boutique_id: saisie.type === 'boutique' ? saisie.boutique_id : null,
    client_nom: saisie.type === 'personne' ? saisie.client_nom?.trim() || null : null,
    client_telephone: saisie.type === 'personne' ? saisie.client_telephone?.trim() || null : null,
    client_email: saisie.type === 'personne' ? saisie.client_email?.trim() || null : null,
    date_echeance: saisie.date_echeance,
    statut: saisie.statut,
    notes: saisie.notes?.trim() || null,
  }

  let id = saisie.id
  if (id) {
    const { error } = await supabase.from('commandes').update(entete).eq('id', id)
    if (error) throw error
  } else {
    const { data, error } = await supabase.from('commandes').insert(entete).select('id').single()
    if (error) throw error
    id = data.id as string
  }

  // Les lignes sont peu nombreuses : on les remplace en bloc plutôt que de faire du diff.
  const { error: delErr } = await supabase.from('commande_lignes').delete().eq('commande_id', id)
  if (delErr) throw delErr
  const lignes = saisie.lignes
    .filter((l) => l.designation.trim() && l.quantite > 0)
    .map((l, i) => ({
      commande_id: id as string,
      produit_id: l.produit_id,
      designation: l.designation.trim().slice(0, 300),
      couleur: l.couleur?.trim() || null,
      quantite: l.quantite,
      deja_en_stock: l.deja_en_stock,
      position: i,
    }))
  if (lignes.length) {
    const { error } = await supabase.from('commande_lignes').insert(lignes)
    if (error) throw error
  }
  return id as string
}

export function useSaveCommande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveCommande,
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMANDES_KEY }),
  })
}

export function useChangerStatutCommande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: CommandeStatut }) => {
      const { error } = await supabase.from('commandes').update({ statut }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMANDES_KEY }),
  })
}

/** Marque toute la commande comme couverte par du stock déjà fait (ou l'inverse) : ses
 * lignes sortent (ou reviennent) dans le calcul du besoin en matière première. */
export function useMarquerCommandeEnStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, enStock }: { id: string; enStock: boolean }) => {
      const { error } = await supabase.from('commande_lignes').update({ deja_en_stock: enStock }).eq('commande_id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMANDES_KEY }),
  })
}

export function useArchiverCommande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, archiver }: { id: string; archiver: boolean }) => {
      const { error } = await supabase
        .from('commandes')
        .update({ archived_at: archiver ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMANDES_KEY }),
  })
}

export function useDeleteCommande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('commandes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMANDES_KEY }),
  })
}
