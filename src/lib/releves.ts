import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { messageErreur, type ReleveAEmettre, type ReleveEmis } from './boutique-etat'
import { MES_BOUTIQUES_KEY } from './boutiques'
import { functionErrorMessage } from './push'
import { supabase } from './supabase'

// Le relevé facturable, côté app : ce qu'il reste à facturer (calculé par la base), l'émission du
// document, et les relevés déjà remis.
//
// Le calcul n'est pas refait ici : `releve_a_emettre()` le fait en base, la même fonction qui sert
// au PDF. L'écran ne fait que l'afficher — sinon deux totaux différents finiraient par exister.

export const releveAEmettreKey = (boutiqueId: string | null) => ['releve_a_emettre', boutiqueId ?? '']
const RELEVES_EMIS_KEY = ['releves_emis']

/** Ce qui reste à facturer chez cette boutique. */
export function useReleveAEmettre(boutiqueId: string | null) {
  return useQuery({
    queryKey: releveAEmettreKey(boutiqueId),
    enabled: !!boutiqueId,
    queryFn: async (): Promise<ReleveAEmettre> => {
      const { data, error } = await supabase.rpc('releve_a_emettre', { p_boutique: boutiqueId as string })
      if (error) throw new Error(error.message)
      const code = (data as { erreur?: string } | null)?.erreur
      if (code) throw new Error(messageErreur(code))
      return data as ReleveAEmettre
    },
  })
}

/** Les relevés déjà émis pour cette boutique — un document remis ne se recalcule pas. */
export function useRelevesEmis(boutiqueId: string | null) {
  return useQuery({
    queryKey: [...RELEVES_EMIS_KEY, boutiqueId ?? ''],
    enabled: !!boutiqueId,
    queryFn: async (): Promise<ReleveEmis[]> => {
      const { data, error } = await supabase
        .from('releves_facturables')
        .select('id, numero, emis_le, periode_debut, periode_fin, total_ventes, valeur_reprises, nb_declarations, pdf_path')
        .eq('boutique_id', boutiqueId as string)
        .order('emis_le', { ascending: false })
      if (error) throw error
      return (data ?? []) as ReleveEmis[]
    },
  })
}

type ReponsePdf = {
  pdf_base64: string
  filename: string
  total_ventes: number
  nb_pieces: number
  nb_reprises: number
  valeur_reprises: number
  a_valider: number
  numero?: string
  releve_id?: string
  pdf_path?: string | null
}

async function invoke(body: Record<string, unknown>): Promise<ReponsePdf> {
  const { data, error } = await supabase.functions.invoke('releve', { body })
  if (error) throw new Error(await functionErrorMessage(error))
  const message = (data as { error?: string })?.error
  if (message) throw new Error(message)
  return data as ReponsePdf
}

/** Une réponse du service devient un PDF ouvrable : blob URL à révoquer après usage. */
function versBlob(reponse: ReponsePdf): { url: string; filename: string; reponse: ReponsePdf } {
  const bytes = Uint8Array.from(atob(reponse.pdf_base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  return { url, filename: reponse.filename, reponse }
}

/** Le PDF avant émission : rien n'est écrit, le numéro n'existe pas encore. */
export async function apercuReleve(boutiqueId: string) {
  return versBlob(await invoke({ mode: 'apercu', boutique_id: boutiqueId }))
}

/** Émettre : la base fige le relevé et lui donne son numéro, le PDF est rangé puis renvoyé. */
export function useEmettreReleve() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (boutiqueId: string) => versBlob(await invoke({ mode: 'emettre', boutique_id: boutiqueId })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MES_BOUTIQUES_KEY })
      qc.invalidateQueries({ queryKey: RELEVES_EMIS_KEY })
      qc.invalidateQueries({ queryKey: ['releve_a_emettre'] })
    },
  })
}

/** Lien temporaire (1 h) vers un relevé déjà émis et rangé. */
export async function urlPdfReleve(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('depots').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
