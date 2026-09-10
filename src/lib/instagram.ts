import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type InstagramAccount } from './supabase'

const ACCOUNT_KEY = ['instagram_account']
const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useInstagramAccount() {
  return useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: async (): Promise<InstagramAccount | null> => {
      const { data, error } = await supabase
        .from('instagram_accounts')
        // jamais access_token côté client : pas besoin, et pas de raison de l'exposer au navigateur.
        .select('user_id, ig_user_id, ig_username, token_expires_at, connected_at')
        .maybeSingle()
      if (error) throw error
      return data as InstagramAccount | null
    },
  })
}

/** Lance la connexion : redirige le navigateur vers l'écran d'autorisation Instagram. */
export function useConnectInstagram() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${FUNCTIONS_URL}/instagram-oauth?action=start`, {
        headers: await authHeader(),
      })
      const body = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !body.url) throw new Error(body.error || 'Connexion impossible.')
      window.location.href = body.url
    },
  })
}

export function useDisconnectInstagram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('instagram_accounts')
        .delete()
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_KEY }),
  })
}

export type PublishResult = {
  publish_status: 'en_attente' | 'publie' | 'erreur'
  publish_error: string | null
  status: string
  ig_media_id: string | null
}

/** Publie une entrée du planning sur Instagram immédiatement. */
export function usePublishEntryNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entryId: string): Promise<PublishResult> => {
      const res = await fetch(`${FUNCTIONS_URL}/instagram-publish`, {
        method: 'POST',
        headers: { ...(await authHeader()), 'content-type': 'application/json' },
        body: JSON.stringify({ entryId }),
      })
      const body = (await res.json()) as PublishResult & { error?: string }
      if (!res.ok) throw new Error(body.error || 'Publication impossible.')
      if (body.publish_status === 'erreur') throw new Error(body.publish_error ?? 'Échec inconnu.')
      return body
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content_entries'] }),
  })
}

const MEDIA_BUCKET = 'content-media'

/** Upload l'image d'une entrée vers le bucket public `content-media`, renvoie son chemin. */
export async function uploadEntryImage(entryId: string, file: File): Promise<string> {
  const userId = (await supabase.auth.getUser()).data.user?.id
  if (!userId) throw new Error('Non authentifié.')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/${entryId}.${ext}`
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
  if (error) throw error
  return path
}

export function entryImageUrl(path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}
