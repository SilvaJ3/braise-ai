import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DepotDoc } from '../../supabase/functions/_shared/depot-doc'
import { functionErrorMessage } from './push'
import {
  supabase,
  type Depot,
  type DepotLigneRow,
  type ProfilEntreprise,
  type ProfilEntrepriseDraft,
} from './supabase'

export type {
  DepotDoc,
  DepotLigne,
} from '../../supabase/functions/_shared/depot-doc'
export {
  fmtDateCourte,
  fmtDateLongue,
  fmtEuro,
  fmtQte,
  parseEmails,
  problemesEnvoi,
  totalDoc,
  totalLigne,
} from '../../supabase/functions/_shared/depot-doc'

const DEPOTS_KEY = ['depots']
const PROFIL_KEY = ['profil_entreprise']

// --- Profil entreprise (en-tête du bon) -----------------------------------------------------

export const PROFIL_VIDE: ProfilEntrepriseDraft = {
  nom: '',
  adresse: '',
  telephone: '',
  tva: '',
  email: '',
  mention_signature:
    "EN SIGNANT, J'ACCEPTE LES CONDITIONS GÉNÉRALES INDIQUÉES DANS LE CONTRAT INITIAL :",
}

export function useProfilEntreprise() {
  return useQuery({
    queryKey: PROFIL_KEY,
    queryFn: async (): Promise<ProfilEntrepriseDraft> => {
      const { data, error } = await supabase
        .from('profil_entreprise')
        .select('nom, adresse, telephone, tva, email, mention_signature')
        .maybeSingle()
      if (error) throw error
      return { ...PROFIL_VIDE, ...data }
    },
  })
}

export function useSaveProfilEntreprise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: ProfilEntrepriseDraft) => {
      const { error } = await supabase
        .from('profil_entreprise')
        .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFIL_KEY }),
  })
}

// --- Bons de dépôt ---------------------------------------------------------------------------

export function useDepots(boutiqueId?: string) {
  return useQuery({
    queryKey: [...DEPOTS_KEY, boutiqueId ?? 'tous'],
    queryFn: async (): Promise<Depot[]> => {
      let q = supabase.from('depots').select('*').order('date_depot', { ascending: false })
      if (boutiqueId) q = q.eq('boutique_id', boutiqueId)
      const { data, error } = await q
      if (error) throw error
      return data as Depot[]
    },
  })
}

export function useDepot(id: string | undefined) {
  return useQuery({
    queryKey: [...DEPOTS_KEY, 'un', id ?? ''],
    enabled: !!id,
    queryFn: async (): Promise<{ depot: Depot; lignes: DepotLigneRow[] } | null> => {
      const { data, error } = await supabase.from('depots').select('*').eq('id', id as string).maybeSingle()
      if (error) throw error
      if (!data) return null
      const { data: lignes, error: e2 } = await supabase
        .from('depot_lignes')
        .select('*')
        .eq('depot_id', id as string)
        .order('position')
      if (e2) throw e2
      return { depot: data as Depot, lignes: (lignes ?? []) as DepotLigneRow[] }
    },
  })
}

export type DepotSaisie = {
  id?: string
  boutique_id: string | null
  date_depot: string
  boutique_nom: string
  boutique_adresse: string | null
  boutique_email: string | null
  notes: string | null
  lignes: Array<{ produit_id: string | null; designation: string; quantite: number; prix_unitaire: number }>
}

/** Crée ou met à jour le brouillon et remplace ses lignes. Renvoie l'id du bon. */
export async function saveDepot(saisie: DepotSaisie): Promise<string> {
  const entete = {
    boutique_id: saisie.boutique_id,
    date_depot: saisie.date_depot,
    boutique_nom: saisie.boutique_nom.trim(),
    boutique_adresse: saisie.boutique_adresse?.trim() || null,
    boutique_email: saisie.boutique_email?.trim() || null,
    notes: saisie.notes?.trim() || null,
  }

  let id = saisie.id
  if (id) {
    const { error } = await supabase.from('depots').update(entete).eq('id', id)
    if (error) throw error
  } else {
    const { data, error } = await supabase.from('depots').insert(entete).select('id').single()
    if (error) throw error
    id = data.id as string
  }

  // Les lignes sont peu nombreuses : on les remplace en bloc plutôt que de faire du diff.
  const { error: delErr } = await supabase.from('depot_lignes').delete().eq('depot_id', id)
  if (delErr) throw delErr
  const lignes = saisie.lignes
    .filter((l) => l.designation.trim() && l.quantite > 0)
    .map((l, i) => ({
      depot_id: id as string,
      produit_id: l.produit_id,
      designation: l.designation.trim().slice(0, 300),
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
      position: i,
    }))
  if (lignes.length) {
    const { error } = await supabase.from('depot_lignes').insert(lignes)
    if (error) throw error
  }
  return id as string
}

export function useSaveDepot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveDepot,
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPOTS_KEY }),
  })
}

export function useDeleteDepot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('depots').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPOTS_KEY }),
  })
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('depot', { body })
  if (error) throw new Error(await functionErrorMessage(error))
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

/** PDF d'aperçu (non enregistré) : renvoie une URL blob à afficher, à révoquer après usage. */
export async function apercuDepot(
  depotId: string,
  signature: string | null,
  signataire: string,
): Promise<{ url: string; filename: string }> {
  const data = await invoke<{ pdf_base64: string; filename: string }>({
    mode: 'apercu',
    depot_id: depotId,
    signature_image: signature ?? '',
    signataire_nom: signataire,
  })
  const bytes = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return { url: URL.createObjectURL(blob), filename: data.filename }
}

export function useEnvoyerDepot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      depot_id: string
      signature_image: string | null
      signataire_nom: string
      email_to: string
      email_cc: string
    }) => invoke<{ numero: string; sent_to: string[] }>({ mode: 'envoyer', ...args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEPOTS_KEY }),
  })
}

/** Lien temporaire (1 h) vers le PDF archivé. */
export async function urlPdfDepot(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('depots').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export const STATUT_LABEL: Record<Depot['statut'], string> = {
  brouillon: 'Brouillon',
  signe: 'Signé',
  envoye: 'Envoyé',
}

/** Reconstruit le document tel qu'il sera imprimé, pour l'affichage des totaux côté app. */
export function docDepuisSaisie(saisie: DepotSaisie, profil: ProfilEntrepriseDraft, signature: string | null, signataire: string): DepotDoc {
  return {
    numero: null,
    date_depot: saisie.date_depot,
    emetteur: profil as ProfilEntreprise,
    boutique_nom: saisie.boutique_nom,
    boutique_adresse: saisie.boutique_adresse,
    boutique_email: saisie.boutique_email,
    lignes: saisie.lignes.map((l) => ({
      designation: l.designation,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
    })),
    notes: saisie.notes,
    signataire_nom: signataire || null,
    signature_image: signature,
  }
}
