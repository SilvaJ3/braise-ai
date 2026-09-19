import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { messageErreur, type BoutiqueEtat, type StatutReleve } from './boutique-etat'
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

// « Dernier contact » par boutique (affiché dans la liste des boutiques) : cette vue se calcule
// sur toute la table et sa clé ne nomme pas la boutique — l'oublier laissait la liste en retard
// d'un cran après l'ajout ou la suppression d'un contact.
const LAST_CONTACTS_KEY = ['boutique_contacts_log', 'last_by_boutique']

/** Un contact ajouté ou supprimé change aussi la date du dernier contact de la boutique. */
function invaliderContacts(qc: QueryClient, boutiqueId: string) {
  qc.invalidateQueries({ queryKey: contactsKey(boutiqueId) })
  qc.invalidateQueries({ queryKey: LAST_CONTACTS_KEY })
}

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
    onSuccess: (_data, draft) => invaliderContacts(qc, draft.boutique_id),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; boutiqueId: string }) => {
      const { error } = await supabase.from('boutique_contacts_log').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { boutiqueId }) => invaliderContacts(qc, boutiqueId),
  })
}

// Dernier contact par boutique, pour l'affichage liste ("pas de contact depuis X").
export function useLastContacts() {
  return useQuery({
    queryKey: LAST_CONTACTS_KEY,
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

// --- Côté artisane : l'état de ses boutiques, ses relevés, son lien (0059, 0060) --------------
//
// Une seule requête porte tout ce qu'elle voit d'une boutique : `mes_boutiques_etat()` — le stock
// pièce par pièce, les relevés reçus, le jeton du lien, les bons en attente de confirmation, et
// ce que la boutique a signalé. Elle est filtrée dans la base par `auth.uid()` : aucun
// identifiant de compte ne circule dans l'appel, et la même fonction ne rend jamais la boutique
// de quelqu'un d'autre.
//
// Les trois écritures qui suivent sont les seules du lot, et elles passent toutes par une
// fonction SQL déjà éprouvée (voir supabase/migrations/0059 et 0060). Rien n'est supprimé :
// un relevé écarté reste, une contestation vue reste, un lien coupé reste.

export const MES_BOUTIQUES_KEY = ['mes_boutiques_etat']

/** Le code d'erreur rendu par une fonction SQL devient une phrase lisible, une fois pour toutes. */
function resultatRpc(data: unknown, error: { message: string } | null) {
  if (error) throw new Error(error.message)
  const code = (data as { erreur?: string } | null)?.erreur
  if (code) throw new Error(messageErreur(code))
  return data
}

export function useMesBoutiquesEtat() {
  return useQuery({
    queryKey: MES_BOUTIQUES_KEY,
    queryFn: async (): Promise<BoutiqueEtat[]> => {
      const { data, error } = await supabase.rpc('mes_boutiques_etat')
      resultatRpc(data, error)
      return ((data as { boutiques?: BoutiqueEtat[] } | null)?.boutiques ?? []) as BoutiqueEtat[]
    },
  })
}

/** Valider un relevé, ou l'écarter en gardant la raison. Le statut change et la note de
 *  l'artisane s'ajoute à celle de la boutique — rien ne s'efface. */
export function useCorrigerDeclaration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statut,
      note,
    }: {
      id: string
      statut: StatutReleve
      note?: string | null
    }) => {
      const { data, error } = await supabase.rpc('corriger_declaration', {
        declaration_param: id,
        statut_param: statut,
        note_param: note?.trim() || null,
      })
      resultatRpc(data, error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MES_BOUTIQUES_KEY }),
  })
}

/** Couper l'accès : le rattachement passe à `actif = false`. La boutique garde son adresse et son
 *  historique, elle perd la lecture de ses pièces et la parole. Ses pièces, elles, ne bougent
 *  pas — elles ne sont simplement plus déclarables par elle. */
export function useCouperLienBoutique() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (boutiqueId: string) => {
      const { data, error } = await supabase.rpc('couper_lien_boutique', {
        boutique_param: boutiqueId,
      })
      resultatRpc(data, error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MES_BOUTIQUES_KEY }),
  })
}

/** « J'ai vu ce qu'elle a signalé ». La trace reste ; elle cesse d'être une nouveauté. */
export function useMarquerContestationVue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (contestationId: string) => {
      const { data, error } = await supabase.rpc('marquer_contestation_vue', {
        contestation_param: contestationId,
      })
      resultatRpc(data, error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MES_BOUTIQUES_KEY }),
  })
}
