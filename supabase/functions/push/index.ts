// Notifications push Web (VAPID). Clé privée = secret Supabase VAPID_PRIVATE_KEY.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APP_URL = 'https://braise-ai.vercel.app'
const VAPID_PUBLIC =
  'BLzRPJbag3rpK5ffOUdVkRfNZq3tua2RzadSjyNNb2u4iEUiCcbCiZnj3uPjOMFUKiUeSYGDSe1vkgWL7taGa7U'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')?.replace(/["'\s]/g, '') || undefined

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

let vapidReady = false
try {
  if (VAPID_PRIVATE) {
    webpush.setVapidDetails('mailto:silvabraga.junior@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)
    vapidReady = true
  }
} catch (e) {
  console.error('VAPID setup failed:', e)
}

type Payload = { title: string; body: string; url?: string }
type Sub = { id: string; endpoint: string; p256dh: string; auth: string }

async function sendToSubs(subs: Sub[], payload: Payload): Promise<number> {
  let sent = 0
  const body = JSON.stringify({ ...payload, url: payload.url ?? APP_URL })
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id)
      } else {
        console.error('push failed', status ?? String(e).slice(0, 200))
      }
    }
  }
  return sent
}

async function subsForUser(userId: string): Promise<Sub[]> {
  const { data } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
  return (data ?? []) as Sub[]
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

async function cronAllowed(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret')
  if (!secret) return false
  const { data } = await admin.rpc('verify_cron_secret', { candidate: secret })
  return data === true
}

async function handleTest(req: Request): Promise<Response> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData.user) return json({ error: 'non authentifié' }, 401)
  const subs = await subsForUser(userData.user.id)
  if (!subs.length) return json({ error: 'aucun appareil abonné' }, 400)
  const sent = await sendToSubs(subs, {
    title: 'Au Coin du Feu',
    body: 'Test — les notifications fonctionnent 🔔',
  })
  return json({ sent })
}

// Un rappel plus vieux que ça (cron en panne, app hors ligne) n'a plus de sens : on le marque
// envoyé sans notifier plutôt que d'arroser de rappels périmés.
const REMINDER_MAX_AGE_MS = 24 * 3_600_000

async function handleReminders(): Promise<Response> {
  const nowIso = new Date().toISOString()
  // Réservation atomique : on marque d'abord (update ... where reminder_sent_at is null),
  // on envoie ensuite. Deux runs qui se chevauchent ne peuvent pas envoyer deux fois.
  const { data: due, error } = await admin
    .from('content_entries')
    .update({ reminder_sent_at: nowIso })
    .not('reminder_at', 'is', null)
    .is('reminder_sent_at', null)
    .lte('reminder_at', nowIso)
    .neq('status', 'publie')
    .select('id, user_id, title, scheduled_time, reminder_at')
  if (error) return json({ error: error.message }, 500)

  let sent = 0
  let skipped = 0
  const cutoff = Date.now() - REMINDER_MAX_AGE_MS
  const subsCache = new Map<string, Sub[]>()
  for (const e of due ?? []) {
    if (new Date(e.reminder_at as string).getTime() < cutoff) {
      skipped++
      continue
    }
    const uid = e.user_id as string
    let subs = subsCache.get(uid)
    if (!subs) {
      subs = await subsForUser(uid)
      subsCache.set(uid, subs)
    }
    const heure = (e.scheduled_time as string | null)?.slice(0, 5)
    if (subs.length) {
      sent += await sendToSubs(subs, {
        title: 'À préparer',
        body: heure ? `${e.title} — publication à ${heure}` : (e.title as string),
        url: `${APP_URL}/planning`,
      })
    }
  }
  return json({ due: due?.length ?? 0, sent, skipped })
}

// Notification ciblée déclenchée par une autre edge function (ex: assistant quand une
// réponse de chat est prête). Authentifié par la clé service role (échange interne).
async function handleNotify(req: Request, body: Record<string, unknown>): Promise<Response> {
  const auth = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!auth || auth !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return json({ error: 'non autorisé' }, 401)
  }
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  const title = typeof body.title === 'string' ? body.title.slice(0, 100) : ''
  if (!userId || !title) return json({ error: 'user_id et title requis' }, 400)
  const url = typeof body.url === 'string' && body.url.startsWith(APP_URL) ? body.url : undefined
  const subs = await subsForUser(userId)
  const sent = await sendToSubs(subs, {
    title,
    body: typeof body.body === 'string' ? body.body.slice(0, 500) : '',
    url,
  })
  return json({ sent })
}

async function handleWeeklyDigest(): Promise<Response> {
  const { data: users } = await admin.from('push_subscriptions').select('user_id')
  const ids = [...new Set((users ?? []).map((u) => u.user_id as string))]
  let sent = 0
  for (const id of ids) {
    const subs = await subsForUser(id)
    sent += await sendToSubs(subs, {
      title: "Ton point de la semaine",
      body: "L'assistant a préparé des idées et des observations pour toi.",
    })
  }
  return json({ sent })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)
  if (!vapidReady) return json({ error: 'VAPID_PRIVATE_KEY manquante ou invalide' }, 500)

  try {
    const body = await req.clone().json().catch(() => ({}))
    const mode = body.mode ?? 'test'

    if (mode === 'test') return await handleTest(req)
    if (mode === 'notify') return await handleNotify(req, body)

    if (mode === 'reminders' || mode === 'weekly-digest') {
      if (!(await cronAllowed(req))) return json({ error: 'non autorisé' }, 401)
      return mode === 'reminders' ? await handleReminders() : await handleWeeklyDigest()
    }
    return json({ error: `mode inconnu: ${mode}` }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
