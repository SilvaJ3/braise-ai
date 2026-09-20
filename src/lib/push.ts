import { supabase } from './supabase'

// Clé publique VAPID (non secrète par nature). La privée est un secret Supabase.
const VAPID_PUBLIC =
  'BLzRPJbag3rpK5ffOUdVkRfNZq3tua2RzadSjyNNb2u4iEUiCcbCiZnj3uPjOMFUKiUeSYGDSe1vkgWL7taGa7U'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushStatus = 'unsupported' | 'denied' | 'off' | 'on'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Autorisation refusée')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }
  const json = sub.toJSON()
  // L'unicité de push_subscriptions est passée de `endpoint` (globale) à `(user_id, endpoint)` :
  // le conflit doit être déclaré sur ces deux colonnes, sinon Postgres refuse l'ON CONFLICT
  // (« aucune contrainte unique correspondante »). user_id est posé explicitement (la colonne a
  // un défaut auth.uid()) pour que l'insertion reste valable même hors session au moment du
  // calcul.
  const { data: auth } = await supabase.auth.getSession()
  const userId = auth.session?.user.id
  if (!userId) throw new Error('Session expirée : reconnecte-toi pour activer les notifications.')
  // Pas de politique RLS UPDATE sur la table : on reste en « ignore duplicates » (ON CONFLICT
  // DO NOTHING), qui ne demande que l'insertion. Un abonnement déjà présent n'est pas réécrit.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
    { onConflict: 'user_id,endpoint', ignoreDuplicates: true },
  )
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('push', { body: { mode: 'test' } })
  if (error) throw new Error(await functionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
}

// Une edge function qui répond 4xx/5xx renvoie un FunctionsHttpError dont le message est
// générique ; le vrai message est dans le body JSON.
export async function functionErrorMessage(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json()
      // Deux orthographes coexistent dans nos fonctions : `error` (relevé, import…) et `erreur`
      // (stripe-checkout, stripe-portal). Sans la seconde, l'artisan lirait « Edge Function
      // returned a non-2xx status code » à la place de la phrase écrite pour lui.
      const message = body?.error ?? body?.erreur
      if (message) return String(message)
    } catch {
      /* ignore */
    }
  }
  return (error as Error)?.message ?? String(error)
}
