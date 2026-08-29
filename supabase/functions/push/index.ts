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

async function handleReminders(): Promise<Response> {
  const { data: due } = await admin
    .from('content_entries')
    .select('id, user_id, title, scheduled_time')
    .not('reminder_at', 'is', null)
    .is('reminder_sent_at', null)
    .lte('reminder_at', new Date().toISOString())
    .neq('status', 'publie')

  let sent = 0
  for (const e of due ?? []) {
    const subs = await subsForUser(e.user_id as string)
    const heure = (e.scheduled_time as string | null)?.slice(0, 5)
    if (subs.length) {
      sent += await sendToSubs(subs, {
        title: 'À préparer',
        body: heure ? `${e.title} — publication à ${heure}` : (e.title as string),
        url: `${APP_URL}/planning`,
      })
    }
    await admin
      .from('content_entries')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', e.id)
  }
  return json({ due: due?.length ?? 0, sent })
}

// Notification ciblée déclenchée par une autre edge function (ex: assistant quand une
// réponse de chat est prête). Authentifié par la clé service role (échange interne).
async function handleNotify(req: Request, body: Record<string, unknown>): Promise<Response> {
  const auth = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!auth || auth !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return json({ error: 'non autorisé' }, 401)
  }
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  const title = typeof body.title === 'string' ? body.title : ''
  if (!userId || !title) return json({ error: 'user_id et title requis' }, 400)
  const subs = await subsForUser(userId)
  const sent = await sendToSubs(subs, {
    title,
    body: typeof body.body === 'string' ? body.body : '',
    url: typeof body.url === 'string' ? body.url : undefined,
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
    return json({ error: String(e) }, 500)
  }
})
