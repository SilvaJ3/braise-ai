// Assistant IA "Au Coin du Feu" — chat d'idées (réponse en arrière-plan + push) + bilan hebdo.
// Clé Anthropic uniquement côté serveur (secret Supabase ANTHROPIC_API_KEY).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { anthropicMessages, textOf, type AnthropicResp } from '../_shared/anthropic.ts'

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

// Garde-fous
const MAX_MESSAGE_CHARS = 4000 // question utilisateur
const MAX_TITLE_CHARS = 300 // titre d'idée (contrainte DB content_entries_title_len)
const MAX_NOTE_CHARS = 4000
const PENDING_STALE_MS = 5 * 60_000 // réponse « en cours » plus vieille que ça = plantée
const WEEKLY_MIN_INTERVAL_MS = 10 * 60_000 // anti-spam du bouton « Générer des idées »

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
  const title = typeof idea.title === 'string' ? idea.title.trim().slice(0, MAX_TITLE_CHARS) : ''
  if (!title) return null
  const date = typeof idea.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(idea.date) ? idea.date : null
  const notes = typeof idea.note === 'string' && idea.note.trim() ? idea.note.trim().slice(0, MAX_NOTE_CHARS) : null
  const { data, error } = await admin
    .from('content_entries')
    .insert({
      user_id: userId,
      title,
      platform: clean(idea.platform, PLATFORMS),
      type: clean(idea.type, TYPES),
      date,
      status: 'idee',
      source: 'assistant',
      notes,
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

// Timeout 100 s + 2 retries (429/5xx/réseau). Le chat tourne en arrière-plan (waitUntil),
// le bilan hebdo doit tenir dans la limite de l'edge function.
function anthropic(body: Record<string, unknown>, timeoutMs = 100_000): Promise<AnthropicResp> {
  return anthropicMessages(ANTHROPIC_KEY!, { model: MODEL, ...body }, { timeoutMs, retries: 2 })
}

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
      signal: AbortSignal.timeout(15_000),
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

type BoutiqueRow = { id: string; nom: string; canal_prefere: string | null }

async function loadBoutiques(userId: string): Promise<string> {
  const { data: boutiques } = await admin
    .from('boutiques')
    .select('id, nom, canal_prefere')
    .eq('user_id', userId)
    .eq('actif', true)
    .order('nom')
  if (!boutiques?.length) return ''

  const { data: contacts } = await admin
    .from('boutique_contacts_log')
    .select('boutique_id, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  const lastByBoutique = new Map<string, string>()
  for (const c of contacts ?? []) {
    if (!lastByBoutique.has(c.boutique_id as string)) {
      lastByBoutique.set(c.boutique_id as string, c.date as string)
    }
  }

  const today = Date.now()
  const lines = (boutiques as BoutiqueRow[]).map((b) => {
    const last = lastByBoutique.get(b.id)
    const jours = last ? Math.floor((today - new Date(`${last}T00:00:00`).getTime()) / 86_400_000) : null
    const contactBit = jours == null ? 'jamais contactée' : `dernier contact il y a ${jours} j`
    return `- ${b.nom}${b.canal_prefere ? ` (${b.canal_prefere})` : ''} — ${contactBit}`
  })
  return `\n\nBoutiques en dépôt-vente d'Alexandra :\n${lines.join('\n')}`
}

type MatiereRow = {
  id: string
  nom: string
  unite: string
  stock_actuel: number
  seuil_alerte: number | null
  fournisseur: { nom: string; delai_livraison_jours: number | null } | null
}

async function loadMatieres(userId: string): Promise<MatiereRow[]> {
  const { data } = await admin
    .from('matieres_premieres')
    .select('id, nom, unite, stock_actuel, seuil_alerte, fournisseur:fournisseurs(nom, delai_livraison_jours)')
    .eq('user_id', userId)
    .eq('actif', true)
    .order('nom')
    .limit(60)
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>
    const f = Array.isArray(row.fournisseur) ? row.fournisseur[0] : row.fournisseur
    return {
      id: row.id as string,
      nom: row.nom as string,
      unite: row.unite as string,
      stock_actuel: Number(row.stock_actuel ?? 0),
      seuil_alerte: row.seuil_alerte == null ? null : Number(row.seuil_alerte),
      fournisseur: (f as MatiereRow['fournisseur']) ?? null,
    }
  })
}

const fmtQty = (n: number, unite: string) =>
  `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, '')} ${unite === 'piece' ? 'pc' : unite}`

function stockContext(matieres: MatiereRow[]): string {
  if (!matieres.length) return ''
  const sous = matieres.filter((m) => m.seuil_alerte != null && m.stock_actuel <= m.seuil_alerte)
  const lines = matieres.map((m) => {
    const bits = [fmtQty(m.stock_actuel, m.unite)]
    if (m.seuil_alerte != null) bits.push(`seuil ${fmtQty(m.seuil_alerte, m.unite)}`)
    if (m.fournisseur?.nom) {
      bits.push(
        `chez ${m.fournisseur.nom}${m.fournisseur.delai_livraison_jours != null ? `, délai ${m.fournisseur.delai_livraison_jours} j` : ''}`,
      )
    }
    return `- ${m.nom} : ${bits.join(', ')}`
  })
  const alerte = sous.length
    ? `\nSous le seuil (à recommander) : ${sous.map((m) => m.nom).join(', ')}.`
    : ''
  return `\n\nStock de matières premières :\n${lines.join('\n')}${alerte}`
}

async function buildContext(userId: string, planningLimit: number): Promise<string> {
  const [profil, produits, perf, planning, boutiques, matieres] = await Promise.all([
    loadProfil(userId),
    loadProduits(userId),
    loadPerf(userId),
    loadPlanning(userId, planningLimit),
    loadBoutiques(userId),
    loadMatieres(userId).catch(() => [] as MatiereRow[]),
  ])
  return `${profil}${produits}${perf}${boutiques}${stockContext(matieres)}\n\nPlanning actuel d'Alexandra :\n${planningContext(planning)}`
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
        if (block.name !== ADD_TOOL.name) {
          results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Outil inconnu.' })
          continue
        }
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
      .update({ content: reply.slice(0, 20_000), status: 'done', meta: { added } })
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

  const body = await req.json().catch(() => ({}))
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return json({ error: 'message vide' }, 400)
  if (message.length > MAX_MESSAGE_CHARS) {
    return json({ error: `message trop long (max ${MAX_MESSAGE_CHARS} caractères)` }, 400)
  }

  // Une seule réponse en cours à la fois : ne pas réempiler si l'assistant travaille déjà.
  // Une réponse « pending » trop vieille = edge function tuée avant d'écrire : on la clôt en
  // erreur pour ne pas bloquer le chat indéfiniment.
  const { data: busyRows } = await admin
    .from('chat_messages')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('role', 'assistant')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  const now = Date.now()
  const stale = (busyRows ?? []).filter((r) => now - new Date(r.created_at as string).getTime() > PENDING_STALE_MS)
  if (stale.length) {
    await admin
      .from('chat_messages')
      .update({ content: "La réponse n'a pas abouti (délai dépassé). Repose ta question.", status: 'error' })
      .in('id', stale.map((r) => r.id as string))
  }
  const busy = (busyRows ?? []).find((r) => !stale.includes(r))
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

// Seuil avant relance : pas de contact depuis 3 semaines. À caler avec Alexandra.
const RELANCE_SEUIL_JOURS = 21

// Suggestion relance_boutique : calcul déterministe (pas via le LLM, pour éviter
// toute hallucination sur les dates), une seule suggestion "nouveau" par boutique à la fois.
async function detectRelancesBoutique(userId: string): Promise<number> {
  const { data: boutiques } = await admin
    .from('boutiques')
    .select('id, nom')
    .eq('user_id', userId)
    .eq('actif', true)
  if (!boutiques?.length) return 0

  const { data: contacts } = await admin
    .from('boutique_contacts_log')
    .select('boutique_id, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  const lastByBoutique = new Map<string, string>()
  for (const c of contacts ?? []) {
    if (!lastByBoutique.has(c.boutique_id as string)) {
      lastByBoutique.set(c.boutique_id as string, c.date as string)
    }
  }

  const { data: pending } = await admin
    .from('assistant_suggestions')
    .select('boutique_id')
    .eq('user_id', userId)
    .eq('type', 'relance_boutique')
    .eq('statut', 'nouveau')
  const alreadyPending = new Set((pending ?? []).map((s) => s.boutique_id as string))

  const today = Date.now()
  let created = 0
  for (const b of boutiques as { id: string; nom: string }[]) {
    if (alreadyPending.has(b.id)) continue
    const last = lastByBoutique.get(b.id)
    const jours = last
      ? Math.floor((today - new Date(`${last}T00:00:00`).getTime()) / 86_400_000)
      : Infinity
    if (jours < RELANCE_SEUIL_JOURS) continue
    const semaines = Math.floor(jours / 7)
    const message = last
      ? `${b.nom} : pas de contact depuis ${semaines} semaine${semaines > 1 ? 's' : ''}`
      : `${b.nom} : jamais contactée`
    await admin.from('assistant_suggestions').insert({
      user_id: userId,
      type: 'relance_boutique',
      message,
      boutique_id: b.id,
    })
    created++
  }
  return created
}

// Suggestion alerte_stock : déterministe (stock <= seuil), une seule « nouveau » par matière.
async function detectAlertesStock(userId: string): Promise<number> {
  const matieres = await loadMatieres(userId).catch(() => [] as MatiereRow[])
  const sous = matieres.filter((m) => m.seuil_alerte != null && m.stock_actuel <= m.seuil_alerte)
  if (!sous.length) return 0

  const { data: pending } = await admin
    .from('assistant_suggestions')
    .select('matiere_id')
    .eq('user_id', userId)
    .eq('type', 'alerte_stock')
    .eq('statut', 'nouveau')
  const alreadyPending = new Set((pending ?? []).map((s) => s.matiere_id as string))

  let created = 0
  for (const m of sous) {
    if (alreadyPending.has(m.id)) continue
    const delai = m.fournisseur?.delai_livraison_jours
    const bits = [`${m.nom} : ${fmtQty(m.stock_actuel, m.unite)} en stock, seuil ${fmtQty(m.seuil_alerte as number, m.unite)}`]
    if (m.fournisseur?.nom) bits.push(`à commander chez ${m.fournisseur.nom}${delai != null ? ` (délai ${delai} j)` : ''}`)
    await admin.from('assistant_suggestions').insert({
      user_id: userId,
      type: 'alerte_stock',
      message: bits.join(' — '),
      matiere_id: m.id,
    })
    created++
  }
  return created
}

async function runWeeklyForUser(
  userId: string,
): Promise<{ ideas_inserted: number; observations: number; relances: number; alertes_stock: number }> {
  const today = new Date().toISOString().slice(0, 10)
  const context = await buildContext(userId, 80)

  const system = `${context}

Nous sommes le ${today}.

Prépare :
1. 4 idées de publications concrètes pour les 2 prochaines semaines (varie les plateformes et les types ; appuie-toi sur le catalogue et les retours si disponibles).
2. 1 à 3 observations utiles sur son planning (trous, idées qui stagnent, plateforme délaissée, saisonnalité).

Rends ton travail via l'outil rendre_bilan. N'écris pas de texte en dehors de l'outil.`

  const resp = await anthropic(
    {
      model: WEEKLY_MODEL,
      max_tokens: 2500,
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: 'Génère le bilan de la semaine.' }],
      tools: [BILAN_TOOL],
      tool_choice: { type: 'tool', name: 'rendre_bilan' },
    },
    60_000,
  )
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

  const relances = await detectRelancesBoutique(userId)
  const alertes_stock = await detectAlertesStock(userId)

  return { ideas_inserted: inserted, observations: observations.length, relances, alertes_stock }
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
  const userId = userData.user.id

  // Anti-spam : un bilan manuel au plus toutes les 10 min (chaque run coûte un appel LLM
  // et ajoute des idées au planning).
  const since = new Date(Date.now() - WEEKLY_MIN_INTERVAL_MS).toISOString()
  const { count } = await admin
    .from('assistant_suggestions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('type', 'idee_contenu')
    .gte('created_at', since)
  if ((count ?? 0) > 0) {
    return json({ error: "Des idées viennent d'être générées. Réessaie dans quelques minutes." }, 429)
  }
  return json(await runWeeklyForUser(userId))
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
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
