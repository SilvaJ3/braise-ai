// Publication Instagram (proto V2.5) : image_path (bucket public `content-media`) + légende
// (notes, ou titre à défaut) → conteneur média puis publication via Graph API.
//
// Modes :
//   POST { entryId }   (authentifié, Bearer user) → publie une entrée maintenant
//   POST { mode: 'due' } (cron, x-cron-secret)     → publie toutes les entrées planifiées échues
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { InstagramError, isTokenExpiringSoon, publishImage, refreshLongLivedToken } from '../_shared/instagram.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

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

type Entry = {
  id: string
  user_id: string
  title: string
  notes: string | null
  image_path: string | null
  status: string
  platform: string | null
}

type IgAccount = { ig_user_id: string; access_token: string; token_expires_at: string }

function caption(e: Entry): string {
  return (e.notes?.trim() || e.title).trim()
}

function publicImageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/content-media/${path}`
}

/** Renouvelle le token si besoin (avant J-10), renvoie le token à utiliser. */
async function tokenFor(account: IgAccount, userId: string): Promise<string> {
  if (!isTokenExpiringSoon(account.token_expires_at)) return account.access_token
  try {
    const refreshed = await refreshLongLivedToken(account.access_token)
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await admin
      .from('instagram_accounts')
      .update({ access_token: refreshed.access_token, token_expires_at: expiresAt })
      .eq('user_id', userId)
    return refreshed.access_token
  } catch (e) {
    console.error('refresh token failed', userId, String(e))
    return account.access_token // tente quand même avec l'ancien, l'erreur remontera clairement
  }
}

async function publishEntry(entry: Entry): Promise<void> {
  if (!entry.image_path) {
    await admin
      .from('content_entries')
      .update({ publish_status: 'erreur', publish_error: 'Aucune image jointe.' })
      .eq('id', entry.id)
    return
  }

  const { data: account } = await admin
    .from('instagram_accounts')
    .select('ig_user_id, access_token, token_expires_at')
    .eq('user_id', entry.user_id)
    .maybeSingle()

  if (!account) {
    await admin
      .from('content_entries')
      .update({ publish_status: 'erreur', publish_error: 'Compte Instagram non connecté.' })
      .eq('id', entry.id)
    return
  }

  try {
    const token = await tokenFor(account as IgAccount, entry.user_id)
    const mediaId = await publishImage(
      (account as IgAccount).ig_user_id,
      token,
      publicImageUrl(entry.image_path),
      caption(entry),
    )
    await admin
      .from('content_entries')
      .update({ status: 'publie', publish_status: 'publie', publish_error: null, ig_media_id: mediaId })
      .eq('id', entry.id)
  } catch (e) {
    const msg = e instanceof InstagramError ? e.message : String(e)
    console.error('publishEntry', entry.id, msg)
    await admin
      .from('content_entries')
      .update({ publish_status: 'erreur', publish_error: msg.slice(0, 500) })
      .eq('id', entry.id)
  }
}

async function handleNow(req: Request): Promise<Response> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData } = await admin.auth.getUser(token)
  if (!userData.user) return json({ error: 'Non authentifié.' }, 401)

  const { entryId } = (await req.json().catch(() => ({}))) as { entryId?: string }
  if (!entryId) return json({ error: 'entryId manquant.' }, 400)

  const { data: entry } = await admin
    .from('content_entries')
    .select('id, user_id, title, notes, image_path, status, platform')
    .eq('id', entryId)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (!entry) return json({ error: 'Entrée introuvable.' }, 404)
  if (entry.platform !== 'instagram') return json({ error: 'Plateforme différente d’Instagram.' }, 400)

  await admin.from('content_entries').update({ publish_status: 'en_attente' }).eq('id', entryId)
  await publishEntry(entry as Entry)

  const { data: refreshed } = await admin
    .from('content_entries')
    .select('publish_status, publish_error, status, ig_media_id')
    .eq('id', entryId)
    .single()
  return json(refreshed)
}

async function handleDue(): Promise<Response> {
  const nowIso = new Date().toISOString()
  const { data: entries } = await admin
    .from('content_entries')
    .select('id, user_id, title, notes, image_path, status, platform, date, scheduled_time')
    .eq('platform', 'instagram')
    .eq('status', 'planifie')
    .not('date', 'is', null)
    .not('image_path', 'is', null)
    .or('publish_status.is.null,publish_status.eq.erreur')

  const due = (entries ?? []).filter((e) => {
    if (!e.date) return false
    const at = new Date(`${e.date}T${e.scheduled_time || '00:00'}`)
    return at.toISOString() <= nowIso
  })

  for (const e of due) {
    await admin.from('content_entries').update({ publish_status: 'en_attente' }).eq('id', e.id)
    await publishEntry(e as Entry)
  }
  return json({ traitees: due.length })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non supportée.' }, 405)

  const body = (await req.clone().json().catch(() => ({}))) as { mode?: string }
  if (body.mode === 'due') {
    if (!(await cronAllowed(req))) return json({ error: 'Non autorisé.' }, 401)
    return handleDue()
  }
  return handleNow(req)
})
