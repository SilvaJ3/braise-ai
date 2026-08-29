// Assistant IA "Au Coin du Feu" — chat d'idées (réponse en arrière-plan + push) + bilan hebdo.
// Clé Anthropic uniquement côté serveur (secret Supabase ANTHROPIC_API_KEY).
import { createClient } from 'jsr:@supabase/supabase-js@2'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APP_URL = 'https://braise-ai.vercel.app'

// Sonnet partout : bon rapport qualité/coût, ~5-10x moins cher qu'Opus pour le chat.
const MODEL = 'claude-sonnet-5'
// Run hebdo : effort bas pour tenir dans la limite edge function
const WEEKLY_MODEL = 'claude-sonnet-5'

const DEFAULT_PROFIL = `Tu assistes Alexandra, artisane qui fabrique des bougies à la main en Belgique.
Elle vend en direct sur les réseaux sociaux (Instagram, Facebook, TikTok) et en dépôt-vente
à des boutiques (B2B). Elle gère tout seule et manque de temps. Ton rôle : l'inspirer, lui
proposer des idées de contenu concrètes et actionnables, et l'accompagner dans son planning.
Sois chaleureux, direct, jamais corporate. Réponds en français.`

const TOOL_RULE = `Quand Alexandra te demande d'ajouter une ou des idées à son planning (ou dit oui à ta
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

const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search', max_uses: 2 }

const BILAN_TOOL = {
  name: 'rendre_bilan',
  description: 'Rends ton bilan de la semaine : idées de publications + observations sur le planning.',
  input_schema: {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            platform: { type: 'string', enum: [...PLATFORMS] },
            type: { type: 'string', enum: [...TYPES] },
            note: { type: 'string', description: 'angle / pourquoi' },
          },
          required: ['title'],
        },
      },
      observations: { type: 'array', items: { type: 'string' } },
    },
    required: ['ideas', 'observations'],
  },
}

type AnthropicBlock = {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}
type AnthropicResp = { content: AnthropicBlock[]; stop_reason: string }

async function anthropic(body: Record<string, unknown>): Promise<AnthropicResp> {
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

// Envoie une notification push à un utilisateur via la fonction `push` (mode notify,
// authentifié par la clé service role — échange interne entre edge functions).
async function sendPush(userId: string, title: string, body: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        mode: 'notify',
        user_id: userId,
        title,
        body,
        url: `${APP_URL}/assistant`,
      }),
    })
  } catch (e) {
    console.error('sendPush failed', e)
  }
}

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

async function loadProfil(userId: string): Promise<string> {
  const { data } = await admin
    .from('assistant_profil')
    .select('contenu')
    .eq('user_id', userId)
    .maybeSingle()
  const c = (data?.contenu ?? '').trim()
  return c || DEFAULT_PROFIL
}

async function loadProduits(userId: string): Promise<string> {
  const { data } = await admin
    .from('produits')
    .select('nom, senteur, description, prix_vente, saison')
    .eq('user_id', userId)
    .eq('actif', true)
    .order('nom')
  if (!data?.length) return ''
  const lines = data.map((p) => {
    const bits = [
      p.senteur,
      p.prix_vente != null ? `${p.prix_vente} €` : null,
      p.saison && p.saison !== 'toute_annee' ? p.saison : null,
    ]
      .filter(Boolean)
      .join(', ')
    return `- ${p.nom}${bits ? ` (${bits})` : ''}${p.description ? ` — ${p.description}` : ''}`
  })
  return `\n\nCatalogue de bougies d'Alexandra :\n${lines.join('\n')}`
}

async function loadPerf(userId: string): Promise<string> {
  const { data } = await admin
    .from('content_entries')
    .select('title, perf, platform')
    .eq('user_id', userId)
    .eq('status', 'publie')
    .not('perf', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)
  if (!data?.length) return ''
  const label: Record<string, string> = {
    carton: 'a très bien marché',
    ok: 'correct',
    bof: 'a peu marché',
  }
  const lines = data.map(
    (e) => `- ${e.title}${e.platform ? ` (${e.platform})` : ''} : ${label[e.perf as string]}`,
  )
  return `\n\nRetours sur les publications passées (tiens-en compte) :\n${lines.join('\n')}`
}

async function buildContext(userId: string, planningLimit: number): Promise<string> {
  const [profil, produits, perf, planning] = await Promise.all([
    loadProfil(userId),
    loadProduits(userId),
    loadPerf(userId),
    loadPlanning(userId, planningLimit),
  ])
  return `${profil}${produits}${perf}\n\nPlanning actuel d'Alexandra :\n${planningContext(planning)}`
}

// --- Chat : réponse générée en arrière-plan, notifiée par push ------------------

type ChatTurnMsg = { role: string; content: unknown }

async function runChatTurn(
  userId: string,
  assistantId: string,
  system: string,
  messages: ChatTurnMsg[],
): Promise<void> {
  try {
    let added = 0
    let reply = ''
    for (let step = 0; step < 6; step++) {
      const resp = await anthropic({
        max_tokens: 2000,
        system,
        messages,
        tools: [ADD_TOOL, WEB_SEARCH_TOOL],
      })
      if (resp.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: resp.content })
        continue
      }
      if (resp.stop_reason !== 'tool_use') {
        reply = textOf(resp.content)
        break
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
    if (!reply) {
      reply = added > 0 ? 'Idées ajoutées à ton planning.' : "Je n'ai pas su répondre, reformule ?"
    }
    await admin
      .from('chat_messages')
      .update({ content: reply, status: 'done', meta: { added } })
      .eq('id', assistantId)
    await sendPush(userId, "Réponse de l'assistant", reply.slice(0, 140))
  } catch (e) {
    console.error('runChatTurn', e)
    await admin
      .from('chat_messages')
      .update({
        content: 'Désolé, une erreur est survenue. Réessaie dans un moment.',
        status: 'error',
      })
      .eq('id', assistantId)
    await sendPush(userId, 'Assistant', "La réponse n'a pas pu être générée. Réessaie.")
  }
}

async function handleChat(req: Request): Promise<Response> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData.user) return json({ error: 'non authentifié' }, 401)
  const userId = userData.user.id

  const body = await req.json()
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return json({ error: 'message vide' }, 400)

  // Une seule réponse en cours à la fois : ne pas réempiler si l'assistant travaille déjà.
  const { data: busy } = await admin
    .from('chat_messages')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .eq('status', 'pending')
    .maybeSingle()
  if (busy) return json({ pending_id: busy.id, already: true })

  await admin.from('chat_messages').insert({ user_id: userId, role: 'user', content: message })
  const { data: assistantRow, error: insErr } = await admin
    .from('chat_messages')
    .insert({ user_id: userId, role: 'assistant', content: '', status: 'pending' })
    .select('id')
    .single()
  if (insErr || !assistantRow) return json({ error: 'création de la réponse impossible' }, 500)
  const assistantId = assistantRow.id as string

  // Historique (hors réponse en cours), 20 derniers messages, ordre chronologique.
  const { data: hist } = await admin
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', userId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)
  const messages: ChatTurnMsg[] = (hist ?? [])
    .reverse()
    .map((m) => ({ role: m.role as string, content: m.content as string }))
  while (messages.length && messages[0].role !== 'user') messages.shift()

  const context = await buildContext(userId, 60)
  const system = `${context}

${TOOL_RULE}

Tu peux utiliser la recherche web si Alexandra demande des tendances actuelles, des idées
qui marchent en ce moment, ou des infos d'actualité.

Écris en texte simple pour un écran de téléphone : pas de markdown (pas de **, #, >, -),
des paragraphes courts, va à l'essentiel.`

  EdgeRuntime.waitUntil(runChatTurn(userId, assistantId, system, messages))
  return json({ pending_id: assistantId })
}

// --- Bilan hebdo : tous les utilisateurs (cron) ou l'appelant (déclenchement manuel) ---

async function runWeeklyForUser(
  userId: string,
): Promise<{ ideas_inserted: number; observations: number }> {
  const today = new Date().toISOString().slice(0, 10)
  const context = await buildContext(userId, 80)

  const system = `${context}

Nous sommes le ${today}.

Prépare :
1. 4 idées de publications concrètes pour les 2 prochaines semaines (varie les plateformes et les types ; appuie-toi sur le catalogue et les retours si disponibles).
2. 1 à 3 observations utiles sur son planning (trous, idées qui stagnent, plateforme délaissée, saisonnalité).

Rends ton travail via l'outil rendre_bilan. N'écris pas de texte en dehors de l'outil.`

  const resp = await anthropic({
    model: WEEKLY_MODEL,
    max_tokens: 2500,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: 'Génère le bilan de la semaine.' }],
    tools: [BILAN_TOOL],
    tool_choice: { type: 'tool', name: 'rendre_bilan' },
  })
  const call = resp.content.find((b) => b.type === 'tool_use')
  const parsed = (call?.input as { ideas?: IdeaInput[]; observations?: string[] }) ?? {
    ideas: [],
    observations: [],
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

  return { ideas_inserted: inserted, observations: observations.length }
}

async function handleWeekly(req: Request): Promise<Response> {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret) {
    const { data: ok } = await admin.rpc('verify_cron_secret', { candidate: cronSecret })
    if (!ok) return json({ error: 'non autorisé' }, 401)
    // ponytail: boucle en série, OK jusqu'à ~50 comptes ; au-delà, fan-out (1 invocation/user).
    const { data: list } = await admin.auth.admin.listUsers()
    const users = (list?.users ?? []).slice(0, 50)
    const results: Record<string, unknown> = {}
    for (const u of users) {
      try {
        results[u.id] = await runWeeklyForUser(u.id)
      } catch (e) {
        results[u.id] = { error: String(e) }
      }
    }
    return json({ users: users.length, results })
  }

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData } = await admin.auth.getUser(token)
  if (!userData.user) return json({ error: 'non autorisé' }, 401)
  return json(await runWeeklyForUser(userData.user.id))
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
    return json({ error: `${e}` }, 500)
  }
})
