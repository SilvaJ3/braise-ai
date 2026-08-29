// Assistant IA "Au Coin du Feu" — chat d'idées (+ ajout au planning) + génération hebdo.
// Clé Anthropic uniquement côté serveur (secret Supabase ANTHROPIC_API_KEY).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODEL = 'claude-opus-5'

// ponytail: profil métier codé en dur. Passer en table éditable si Alexandra
// veut l'ajuster souvent.
const PROFIL = `Tu assistes Alexandra, artisane qui fabrique des bougies à la main en Belgique.
Elle vend en direct sur les réseaux sociaux (Instagram, Facebook, TikTok) et en dépôt-vente
à des boutiques (B2B). Elle gère tout seule et manque de temps. Ton rôle : l'inspirer, lui
proposer des idées de contenu concrètes et actionnables, et l'accompagner dans son planning.
Sois chaleureux, direct, jamais corporate. Réponds en français.

Quand Alexandra te demande d'ajouter une ou des idées à son planning (ou dit oui à ta
proposition de le faire), utilise l'outil ajouter_idees_au_planning. N'invente pas de dates
si elle n'en donne pas : laisse date vide (l'entrée reste une simple idée).`

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const PLATFORMS = ['instagram', 'facebook', 'tiktok'] as const
const TYPES = ['post', 'story', 'reel'] as const

const clean = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null

type IdeaInput = {
  title?: string
  platform?: string | null
  type?: string | null
  date?: string | null
  note?: string | null
}

async function insertEntry(userId: string, idea: IdeaInput): Promise<string | null> {
  if (!idea.title) return null
  const date = typeof idea.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(idea.date) ? idea.date : null
  const { data, error } = await admin
    .from('content_entries')
    .insert({
      user_id: userId,
      title: idea.title,
      platform: clean(idea.platform, PLATFORMS),
      type: clean(idea.type, TYPES),
      date,
      status: 'idee',
      source: 'assistant',
      notes: idea.note ?? null,
    })
    .select('id')
    .single()
  return error || !data ? null : (data.id as string)
}

const ADD_TOOL = {
  name: 'ajouter_idees_au_planning',
  description:
    "Ajoute une ou plusieurs idées de publication dans le planning d'Alexandra (statut 'idée').",
  input_schema: {
    type: 'object',
    properties: {
      idees: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Titre court de la publication' },
            platform: { type: 'string', enum: [...PLATFORMS], description: 'optionnel' },
            type: { type: 'string', enum: [...TYPES], description: 'optionnel' },
            date: { type: 'string', description: 'AAAA-MM-JJ, optionnel (vide = simple idée)' },
            note: { type: 'string', description: 'angle / pourquoi, optionnel' },
          },
          required: ['title'],
        },
      },
    },
    required: ['idees'],
  },
}

type AnthropicBlock = {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}

async function anthropic(body: Record<string, unknown>): Promise<{ content: AnthropicBlock[]; stop_reason: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  return await res.json()
}

const textOf = (content: AnthropicBlock[]): string =>
  content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')

type Entry = {
  title: string
  platform: string | null
  type: string | null
  date: string | null
  status: string
  notes: string | null
}

function planningContext(entries: Entry[]): string {
  if (!entries.length) return 'Aucune entrée dans le planning pour le moment.'
  return entries
    .map((e) => {
      const bits = [e.date ?? 'sans date', e.status, e.platform ?? '—', e.type ?? '—']
      return `- ${e.title} (${bits.join(', ')})${e.notes ? ` — ${e.notes}` : ''}`
    })
    .join('\n')
}

async function loadPlanning(userId: string, limit: number): Promise<Entry[]> {
  const { data } = await admin
    .from('content_entries')
    .select('title, platform, type, date, status, notes')
    .eq('user_id', userId)
    .order('date', { ascending: true, nullsFirst: false })
    .limit(limit)
  return (data ?? []) as Entry[]
}

async function handleChat(req: Request): Promise<Response> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData.user) return json({ error: 'non authentifié' }, 401)
  const userId = userData.user.id

  const body = await req.json()
  const messages = (body.messages ?? []).slice(-20)
  if (!messages.length) return json({ error: 'messages vides' }, 400)

  const system = `${PROFIL}\n\nPlanning actuel d'Alexandra :\n${planningContext(await loadPlanning(userId, 60))}`

  let added = 0
  for (let step = 0; step < 4; step++) {
    const resp = await anthropic({
      max_tokens: 2000,
      system,
      messages,
      tools: [ADD_TOOL],
    })
    if (resp.stop_reason !== 'tool_use') {
      return json({ reply: textOf(resp.content), added })
    }
    messages.push({ role: 'assistant', content: resp.content })
    const results: Array<{ type: string; tool_use_id?: string; content: string }> = []
    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue
      const idees = (block.input as { idees?: IdeaInput[] })?.idees ?? []
      let n = 0
      for (const idea of idees.slice(0, 10)) {
        if (await insertEntry(userId, idea)) n++
      }
      added += n
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: `${n} idée(s) ajoutée(s) au planning.`,
      })
    }
    messages.push({ role: 'user', content: results })
  }
  return json({ reply: 'Idées ajoutées.', added })
}

async function isAuthorizedForWeekly(req: Request): Promise<string | null> {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret) {
    const { data: ok } = await admin.rpc('verify_cron_secret', { candidate: cronSecret })
    if (!ok) return null
    const { data: users } = await admin.auth.admin.listUsers()
    return users.users[0]?.id ?? null
  }
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData } = await admin.auth.getUser(token)
  return userData.user?.id ?? null
}

async function handleWeekly(req: Request): Promise<Response> {
  const userId = await isAuthorizedForWeekly(req)
  if (!userId) return json({ error: 'non autorisé' }, 401)

  const today = new Date().toISOString().slice(0, 10)
  const system = `${PROFIL}

Nous sommes le ${today}. Voici le planning d'Alexandra :
${planningContext(await loadPlanning(userId, 80))}

Génère :
1. 4 idées de publications concrètes pour les 2 prochaines semaines (varie les plateformes et les types).
2. 1 à 3 observations utiles sur son planning (trous, idées qui stagnent, plateforme délaissée, saisonnalité).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, de la forme :
{"ideas":[{"title":"...","platform":"instagram|facebook|tiktok|null","type":"post|story|reel|null","note":"pourquoi / angle"}],"observations":["..."]}`

  const resp = await anthropic({
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: 'Génère les idées et observations de la semaine.' }],
  })
  const raw = textOf(resp.content)

  let parsed: { ideas?: IdeaInput[]; observations?: string[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    const s = raw.indexOf('{')
    const e = raw.lastIndexOf('}')
    parsed = s >= 0 && e > s ? JSON.parse(raw.slice(s, e + 1)) : { ideas: [], observations: [] }
  }

  let inserted = 0
  for (const idea of (parsed.ideas ?? []).slice(0, 6)) {
    const id = await insertEntry(userId, idea)
    if (!id) continue
    inserted++
    await admin.from('assistant_suggestions').insert({
      user_id: userId,
      type: 'idee_contenu',
      message: idea.note ? `${idea.title} — ${idea.note}` : idea.title,
      source_id: id,
    })
  }

  const observations = (parsed.observations ?? []).slice(0, 5).filter((o) => typeof o === 'string')
  for (const message of observations) {
    await admin.from('assistant_suggestions').insert({ user_id: userId, type: 'observation', message })
  }

  return json({ ideas_inserted: inserted, observations: observations.length })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)
  if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY non configurée' }, 500)

  try {
    const body = await req.clone().json().catch(() => ({}))
    const mode = body.mode ?? 'chat'
    if (mode === 'chat') return await handleChat(req)
    if (mode === 'weekly') return await handleWeekly(req)
    return json({ error: `mode inconnu: ${mode}` }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
