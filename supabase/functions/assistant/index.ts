// Assistant IA "Braaise" — chat d'idées (réponse en arrière-plan + push) + bilan hebdo.
// Clé Anthropic uniquement côté serveur (secret Supabase ANTHROPIC_API_KEY).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { anthropicMessages, textOf, type AnthropicResp } from '../_shared/anthropic.ts'
import {
  avertissementContexte,
  boutiquesContext,
  dernierContactParBoutique,
  fmtQty,
  joursDepuis,
  messageRelanceBoutique,
  perfContext,
  planningContext,
  produitsContext,
  profilContext,
  stockContext,
  type BoutiqueRow,
  type ContactRow,
  type Entry,
  type MatiereRow,
  type ProduitRow,
  type ProfilCompte,
} from '../_shared/contexte-assistant.ts'

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

const TOOL_RULE = `Quand la personne te demande d'ajouter une ou des idées à son planning (ou dit oui à ta
proposition de le faire), utilise l'outil ajouter_idees_au_planning. N'invente pas de dates
si elle n'en donne pas : laisse date vide (l'entrée reste une simple idée).`

// Garde-fous
const MAX_MESSAGE_CHARS = 4000 // question utilisateur
const MAX_TITLE_CHARS = 300 // titre d'idée (contrainte DB content_entries_title_len)
const MAX_NOTE_CHARS = 4000
const PENDING_STALE_MS = 5 * 60_000 // réponse « en cours » plus vieille que ça = plantée
// Budget de temps d'un tour de chat. Six tours d'outils x 100 s x 2 essais dépassaient
// largement le temps mural d'une edge function : l'isolat était tué en plein travail et
// laissait une réponse « pending » orpheline, que l'utilisatrice attendait 5 minutes.
const CHAT_DEADLINE_MS = 100_000
// Le chat ne dépasse pas MAX_MESSAGE_CHARS : au-delà, la requête n'est même pas lue.
const MAX_BODY_BYTES = 64 * 1024
const WEEKLY_MIN_INTERVAL_MS = 10 * 60_000 // anti-spam du bouton « Générer des idées »
const CHAT_WINDOW_MS = 60 * 60_000 // fenêtre du quota de chat
const CHAT_MAX_PER_WINDOW = 40 // questions max par utilisateur et par heure (borne le coût LLM)

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
    "Ajoute une ou plusieurs idées de publication dans le planning (statut 'idée').",
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

async function loadPlanning(userId: string, limit: number): Promise<Entry[]> {
  const { data, error } = await admin
    .from('content_entries')
    .select('title, platform, type, date, status, notes')
    .eq('user_id', userId)
    .order('date', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Entry[]
}

// --- Anti-répétition ---------------------------------------------------------
// Le run hebdo reproposait les mêmes 4 idées chaque semaine (22 doublons sur 28
// entrées en 5 runs). Le prompt demande d'éviter les répétitions, mais un prompt
// ne garantit rien : ces deux fonctions filtrent avant l'insertion.

const normaliserTitre = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Vrai si `titre` reprend une idée déjà au planning (identique ou reformulée). */
function estDoublon(titre: string, existants: string[]): boolean {
  const t = normaliserTitre(titre)
  if (!t) return true
  const motsT = new Set(t.split(' '))
  for (const e of existants) {
    const n = normaliserTitre(e)
    if (!n) continue
    if (n === t) return true
    const motsE = new Set(n.split(' '))
    let communs = 0
    for (const m of motsT) if (motsE.has(m)) communs++
    const union = new Set([...motsT, ...motsE]).size
    // au-delà de 60 % de mots partagés, c'est la même idée reformulée
    if (union > 0 && communs / union >= 0.6) return true
  }
  return false
}

// Le profil n'a plus de valeur de repli codée en dur : la ligne de `assistant_profil` est la
// seule source, et un profil vide produit une consigne de prudence (voir profilContext).
async function loadProfil(userId: string): Promise<ProfilCompte | null> {
  const { data, error } = await admin
    .from('assistant_profil')
    .select('metier, nom_commercial, ville, pays, canaux, plateformes, contenu')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as ProfilCompte | null) ?? null
}

async function loadProduits(userId: string): Promise<string> {
  const { data, error } = await admin
    .from('produits')
    .select('nom, senteur, description, prix_vente, saison')
    .eq('user_id', userId)
    .eq('actif', true)
    .order('nom')
  if (error) throw error
  return produitsContext((data ?? []) as ProduitRow[])
}

async function loadPerf(userId: string): Promise<string> {
  const { data, error } = await admin
    .from('content_entries')
    .select('title, perf, platform')
    .eq('user_id', userId)
    .eq('status', 'publie')
    .not('perf', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return perfContext((data ?? []) as { title: string; perf: string | null; platform: string | null }[])
}

async function loadBoutiques(userId: string): Promise<string> {
  const { data: boutiques, error: errBoutiques } = await admin
    .from('boutiques')
    .select('id, nom, canal_prefere')
    .eq('user_id', userId)
    .eq('actif', true)
    .order('nom')
  if (errBoutiques) throw errBoutiques
  if (!boutiques?.length) return ''

  const { data: contacts, error: errContacts } = await admin
    .from('boutique_contacts_log')
    .select('boutique_id, date')
    .eq('user_id', userId)
  if (errContacts) throw errContacts

  return boutiquesContext(boutiques as BoutiqueRow[], (contacts ?? []) as ContactRow[])
}

async function loadMatieres(userId: string): Promise<MatiereRow[]> {
  const { data, error } = await admin
    .from('matieres_premieres')
    .select('id, nom, unite, stock_actuel, seuil_alerte, fournisseur:fournisseurs(nom, delai_livraison_jours)')
    .eq('user_id', userId)
    .eq('actif', true)
    .order('nom')
    .limit(60)
  if (error) throw error
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

// Chaque source est chargee independamment : si l'une echoue, on le DIT au modele au lieu de
// lui presenter un contexte vide comme un fait. Avant, une erreur reseau produisait un contexte
// sans planning, et le modele affirmait avec assurance qu'il n'y avait rien de prevu.
async function buildContext(userId: string, planningLimit: number): Promise<string> {
  const avertissement = (quoi: string) => (e: unknown) => {
    console.error(`[contexte] ${quoi} illisible`, e)
    return avertissementContexte(quoi)
  }

  const [profil, produits, perf, planning, boutiques, matieres] = await Promise.all([
    loadProfil(userId).catch(avertissement('profil de marque')),
    loadProduits(userId).catch(avertissement('catalogue produits')),
    loadPerf(userId).catch(avertissement('retours de performance')),
    loadPlanning(userId, planningLimit).catch(avertissement('planning')),
    loadBoutiques(userId).catch(avertissement('boutiques')),
    loadMatieres(userId).catch(() => {
      console.error('[contexte] stock illisible')
      return [] as MatiereRow[]
    }),
  ])

  const blocProfil = typeof profil === 'string' ? profil : profilContext(profil)
  const contextePlanning = typeof planning === 'string' ? planning : planningContext(planning)

  const corps = [blocProfil, produits, perf, boutiques].filter((x) => typeof x === 'string').join('')
  return `${corps}${stockContext(matieres)}${contextePlanning}`
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
    const echeance = Date.now() + CHAT_DEADLINE_MS
    for (let step = 0; step < 6; step++) {
      if (Date.now() > echeance) {
        console.error('[chat] budget de temps épuisé au tour', step)
        break
      }
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

async function handleChat(req: Request, userIdPret?: string): Promise<Response> {
  let userId = userIdPret
  if (!userId) {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: userData, error } = await admin.auth.getUser(token)
    if (error || !userData.user) return json({ error: 'non authentifié' }, 401)
    userId = userData.user.id
  }

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

  // Quota par utilisateur : chaque tour peut coûter plusieurs appels LLM + recherches web.
  // Le compteur vit dans `rate_limits` (service_role uniquement) : contrairement à l'ancien
  // décompte sur `chat_messages`, le client ne peut pas l'effacer pour se redonner du crédit.
  const { data: quotaOk, error: quotaErr } = await admin.rpc('consommer_quota', {
    p_user: userId,
    p_kind: 'chat',
    p_max: CHAT_MAX_PER_WINDOW,
    p_fenetre_sec: Math.floor(CHAT_WINDOW_MS / 1000),
  })
  if (quotaErr) {
    // Un quota indisponible ne doit pas bloquer l'usage : on journalise et on laisse passer.
    console.error('[quota chat]', quotaErr)
  } else if (quotaOk === false) {
    return json({ error: 'Tu as posé beaucoup de questions coup sur coup. Réessaie dans un moment.' }, 429)
  }

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

Tu peux utiliser la recherche web si la personne demande des tendances actuelles, des idées
qui marchent en ce moment, ou des infos d'actualité.

Écris en texte simple pour un écran de téléphone : pas de markdown (pas de **, #, >, -),
des paragraphes courts, va à l'essentiel.`

  EdgeRuntime.waitUntil(runChatTurn(userId, assistantId, system, messages))
  return json({ pending_id: assistantId })
}

// --- Bilan hebdo : tous les utilisateurs (cron) ou l'appelant (déclenchement manuel) ---

// Seuil avant relance : pas de contact depuis 3 semaines (valeur de départ, à ajuster par compte).
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
  const dernier = dernierContactParBoutique((contacts ?? []) as ContactRow[])

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
    const last = dernier.get(b.id)
    const jours = last ? joursDepuis(last, today) : Infinity
    if (jours < RELANCE_SEUIL_JOURS) continue
    await admin.from('assistant_suggestions').insert({
      user_id: userId,
      type: 'relance_boutique',
      message: messageRelanceBoutique(b.nom, jours),
      boutique_id: b.id,
    })
    created++
  }
  return created
}

// Suggestion alerte_stock : déterministe (stock <= seuil), une seule « nouveau » par matière.
// Sautée si le compte a désactivé la synchro produits/matières (Compte → Notifications) :
// profils sans gestion de stock formelle (illustratrices, etc.) qui ne veulent ni suivi
// matière ni rappel de commande fournisseur.
async function detectAlertesStock(userId: string): Promise<number> {
  const { data: reglages } = await admin
    .from('reglages')
    .select('sync_produits_matieres')
    .eq('user_id', userId)
    .maybeSingle()
  if (reglages?.sync_produits_matieres === false) return 0

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
): Promise<{ ideas_inserted: number; ideas_ecartees: number; observations: number; relances: number; alertes_stock: number }> {
  const today = new Date().toISOString().slice(0, 10)
  const context = await buildContext(userId, 80)
  // Titres déjà au planning : le prompt les interdit explicitement, et le filtre
  // ci-dessous les rejette si le modèle passe outre.
  const titresConnus = (await loadPlanning(userId, 300)).map((e) => e.title).filter(Boolean)

  const system = `${context}

Nous sommes le ${today}.

INTERDIT ABSOLU : ne repropose aucune des idées déjà présentes dans le planning ci-dessus,
même reformulée, même avec un autre angle, une autre plateforme ou un autre format. Liste
des titres à ne PAS réutiliser :
${titresConnus.map((t) => `- ${t}`).join('\n')}

Prépare :
1. 4 idées de publications concrètes pour les 2 prochaines semaines, toutes NOUVELLES.
   Choisis ce que cette personne est seule à pouvoir montrer — son atelier, ses matières, ses
   clients, la saison — plutôt qu'un format que tout le monde publie. Ne propose que des
   produits réellement en stock.
2. 1 à 3 observations utiles sur son planning (trous, idées qui stagnent, plateforme
   délaissée, saisonnalité).

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
  let ecartees = 0
  for (const idea of parsed.ideas ?? []) {
    const titre = typeof idea.title === 'string' ? idea.title.trim() : ''
    if (!titre) continue
    if (estDoublon(titre, titresConnus)) {
      ecartees++
      continue
    }
    const id = await insertEntry(userId, idea)
    if (!id) continue
    // évite aussi qu'une même idée revienne deux fois dans le même bilan
    titresConnus.push(titre)
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

  return { ideas_inserted: inserted, ideas_ecartees: ecartees, observations: observations.length, relances, alertes_stock }
}

async function handleWeekly(req: Request, cronVerifie = false): Promise<Response> {
  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret || cronVerifie) {
    if (!cronVerifie) {
      const { data: ok } = await admin.rpc('verify_cron_secret', { candidate: cronSecret })
      if (!ok) return json({ error: 'non autorisé' }, 401)
    }
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

  // Anti-spam : un bilan manuel au plus toutes les 10 min. Le compteur porte sur les LANCEMENTS
  // et non sur les idées produites : depuis que le filtre anti-doublon écarte les idées déjà
  // connues, un run pouvait ne rien insérer et laisser l'ancien compteur à zéro — donc un appel
  // LLM complet à chaque clic.
  const { data: quotaOk, error: quotaErr } = await admin.rpc('consommer_quota', {
    p_user: userId,
    p_kind: 'bilan',
    p_max: 1,
    p_fenetre_sec: Math.floor(WEEKLY_MIN_INTERVAL_MS / 1000),
  })
  if (quotaErr) {
    console.error('[quota bilan]', quotaErr)
  } else if (quotaOk === false) {
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

  // Bornage et authentification AVANT de lire le corps. La fonction est joignable sans clé
  // (verify_jwt = false) : sans ces deux contrôles, un appelant anonyme pouvait faire
  // bufferiser et analyser un JSON volumineux en boucle, sans jamais s'authentifier.
  const taille = Number(req.headers.get('content-length') ?? 0)
  if (taille > MAX_BODY_BYTES) return json({ error: 'requête trop volumineuse' }, 413)

  const cronSecret = req.headers.get('x-cron-secret')
  if (cronSecret) {
    const { data: ok } = await admin.rpc('verify_cron_secret', { candidate: cronSecret })
    if (!ok) return json({ error: 'non autorisé' }, 401)
    return await handleWeekly(req, true)
  }

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return json({ error: 'non autorisé' }, 401)
  const { data: userData, error: errAuth } = await admin.auth.getUser(token)
  if (errAuth || !userData?.user) return json({ error: 'non autorisé' }, 401)
  const userId = userData.user.id

  try {
    const body = await req.json().catch(() => ({}))
    const mode = body.mode ?? 'chat'
    if (mode === 'chat') return await handleChat(req, userId)
    if (mode === 'weekly') return await handleWeekly(req)
    return json({ error: `mode inconnu: ${mode}` }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
