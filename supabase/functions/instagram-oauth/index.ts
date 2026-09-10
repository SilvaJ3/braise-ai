// Connexion Instagram (proto V2.5) : deux modes.
//
//   GET  ?action=start   (authentifié, Bearer user)     → { url } vers l'écran d'autorisation Meta
//   GET  ?code=...&state=... (callback Meta, non authentifié) → échange le code, enregistre le
//                                                                 compte, redirige vers l'app
//
// Secrets attendus : META_APP_ID, META_APP_SECRET.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  authorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchMe,
  InstagramError,
} from '../_shared/instagram.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_ID = Deno.env.get('META_APP_ID')?.trim()
const APP_SECRET = Deno.env.get('META_APP_SECRET')?.trim()
const APP_URL = 'https://braise-ai.vercel.app'
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/instagram-oauth`
const STATE_MAX_AGE_MS = 10 * 60_000

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function redirect(path: string): Response {
  return new Response(null, { status: 302, headers: { ...CORS, location: `${APP_URL}${path}` } })
}

async function userFromRequest(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data.user ?? null
}

async function handleStart(req: Request): Promise<Response> {
  const user = await userFromRequest(req)
  if (!user) return json({ error: 'Non authentifié.' }, 401)
  if (!APP_ID) return json({ error: 'META_APP_ID absent côté serveur.' }, 500)

  const { data, error } = await admin
    .from('oauth_states')
    .insert({ user_id: user.id })
    .select('state')
    .single()
  if (error || !data) return json({ error: 'Impossible de démarrer la connexion.' }, 500)

  const url = authorizeUrl({ appId: APP_ID, appSecret: '', redirectUri: REDIRECT_URI }, data.state)
  return json({ url })
}

async function handleCallback(req: Request): Promise<Response> {
  const u = new URL(req.url)
  const code = u.searchParams.get('code')
  const state = u.searchParams.get('state')
  const err = u.searchParams.get('error_description') || u.searchParams.get('error')

  if (err) return redirect(`/compte/instagram?erreur=${encodeURIComponent(err)}`)
  if (!code || !state) return redirect('/compte/instagram?erreur=lien_invalide')
  if (!APP_ID || !APP_SECRET) return redirect('/compte/instagram?erreur=config_serveur')

  const { data: stateRow } = await admin
    .from('oauth_states')
    .select('user_id, created_at')
    .eq('state', state)
    .maybeSingle()
  await admin.from('oauth_states').delete().eq('state', state) // usage unique, même en cas d'erreur

  if (!stateRow) return redirect('/compte/instagram?erreur=lien_expire')
  if (Date.now() - new Date(stateRow.created_at).getTime() > STATE_MAX_AGE_MS) {
    return redirect('/compte/instagram?erreur=lien_expire')
  }

  try {
    const cfg = { appId: APP_ID, appSecret: APP_SECRET, redirectUri: REDIRECT_URI }
    const short = await exchangeCodeForToken(cfg, code)
    const long = await exchangeForLongLivedToken(APP_SECRET, short.access_token)
    const me = await fetchMe(long.access_token)

    const expiresAt = new Date(Date.now() + long.expires_in * 1000).toISOString()
    await admin.from('instagram_accounts').upsert({
      user_id: stateRow.user_id,
      ig_user_id: me.id,
      ig_username: me.username,
      access_token: long.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    return redirect('/compte/instagram?connecte=1')
  } catch (e) {
    const msg = e instanceof InstagramError ? e.message : String(e)
    console.error('instagram-oauth callback', msg)
    return redirect(`/compte/instagram?erreur=${encodeURIComponent(msg.slice(0, 200))}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const u = new URL(req.url)
  if (u.searchParams.get('action') === 'start') return handleStart(req)
  if (u.searchParams.get('code')) return handleCallback(req)
  return json({ error: 'Requête invalide.' }, 400)
})
