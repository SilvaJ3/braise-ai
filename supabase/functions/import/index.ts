// Import universel (V3) : Excel / CSV / PDF / image / texte → lignes normalisées pour une
// entité (bougies, matières premières, fournisseurs, boutiques). Claude fait le parsing ;
// xlsx lu par _shared/xlsx-lite.ts (pas de dépendance, voir pourquoi dans le fichier) ;
// secours déterministe par en-têtes de colonnes si l'IA est indisponible (CSV / tableur).
// Rien n'est écrit en base ici : le client affiche un aperçu, l'utilisateur confirme, puis
// insère via RLS. Clé Anthropic uniquement côté serveur.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { anthropicMessages, toolInputOf } from '../_shared/anthropic.ts'
import {
  ENTITIES,
  MAX_FILE_BYTES,
  MAX_ROWS,
  MAX_TEXT_CHARS,
  fileKind,
  isImportEntity,
  parseCsv,
  rowsFromTable,
  sanitizeLlmOutput,
  toolSchema,
  type ImportEntity,
  type ImportResult,
} from '../_shared/import-entities.ts'
import { readXlsx, sheetToCsv } from '../_shared/xlsx-lite.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MODEL = 'claude-sonnet-5'
const MAX_SHEETS = 6

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^;]+;base64,/, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// UTF-8 d'abord ; si beaucoup de caractères de remplacement, on retente en windows-1252
// (exports Excel « CSV » français).
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const bad = (utf8.match(/�/g) ?? []).length
  if (bad === 0 || bad < utf8.length / 500) return utf8
  try {
    return new TextDecoder('windows-1252').decode(bytes)
  } catch {
    return utf8
  }
}

type Extracted =
  | { kind: 'text'; text: string; table: string[][] | null; sheets: string[] }
  | { kind: 'pdf' | 'image'; base64: string; mime: string }

async function extract(kind: ReturnType<typeof fileKind>, bytes: Uint8Array, b64: string, mime: string, filename: string): Promise<Extracted> {
  if (kind === 'pdf') return { kind: 'pdf', base64: b64, mime: 'application/pdf' }
  if (kind === 'image') {
    const m = /^image\/(png|jpeg|webp|gif)$/.test(mime) ? mime : 'image/png'
    return { kind: 'image', base64: b64, mime: m }
  }
  if (kind === 'spreadsheet') {
    const wb = await readXlsx(bytes, { maxRows: MAX_ROWS + 20, maxSheets: MAX_SHEETS })
    const parts: string[] = []
    const sheets: string[] = []
    let table: string[][] | null = null
    for (const sh of wb) {
      sheets.push(sh.name)
      if (!table) table = sh.rows
      parts.push(`### Feuille « ${sh.name} » (${sh.rows.length} lignes)\n${sheetToCsv(sh.rows)}`)
    }
    return { kind: 'text', text: parts.join('\n\n'), table, sheets }
  }
  // texte / csv / json / inconnu (on tente en texte)
  const text = decodeText(bytes)
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  const looksTabular = ext === 'csv' || ext === 'tsv' || /[;,\t].*\n.*[;,\t]/.test(text.slice(0, 2000))
  return { kind: 'text', text, table: looksTabular ? parseCsv(text) : null, sheets: [] }
}

function systemPrompt(entity: ImportEntity): string {
  const def = ENTITIES[entity]
  const fields = def.fields.map((f) => `- ${f.key} : ${f.description}`).join('\n')
  return `Tu extrais des données d'un document fourni par une artisane (bougies faites main, Belgique) pour
les importer dans son application. Entité cible : ${def.label}. ${def.hint}

Champs à remplir pour chaque ligne :
${fields}

Règles :
- Recopie les valeurs telles quelles (pas d'invention, pas d'arrondi, pas de traduction des noms).
- Une ligne par ${def.labelSingular} distincte. Ignore les lignes vides, totaux, en-têtes répétés,
  lignes de variantes/images sans nom.
- Nombres : convertis en nombre décimal (12,50 € → 12.5). Ne convertis pas les unités sauf si le
  champ le demande explicitement.
- Si une information n'est pas dans le document, laisse le champ absent (n'invente pas).
- Si le document contient plusieurs feuilles/tableaux, prends celui ou ceux qui correspondent à
  l'entité cible ; signale les autres dans les avertissements.
- Maximum ${MAX_ROWS} lignes ; au-delà, signale la troncature.
- Réponds uniquement via l'outil rendre_lignes.`
}

async function parseWithClaude(entity: ImportEntity, ex: Extracted): Promise<ImportResult> {
  const content: unknown[] = []
  if (ex.kind === 'text') {
    let text = ex.text
    if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS) + '\n[... document tronqué ...]'
    content.push({ type: 'text', text: `Document :\n\n${text}` })
  } else if (ex.kind === 'pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: ex.base64 } })
    content.push({ type: 'text', text: 'Extrais les lignes de ce document.' })
  } else {
    content.push({ type: 'image', source: { type: 'base64', media_type: ex.mime, data: ex.base64 } })
    content.push({ type: 'text', text: 'Extrais les lignes de cette image (tableau, liste, photo de catalogue…).' })
  }

  const resp = await anthropicMessages(
    ANTHROPIC_KEY!,
    {
      model: MODEL,
      max_tokens: 16_000,
      system: systemPrompt(entity),
      messages: [{ role: 'user', content }],
      tools: [{ name: 'rendre_lignes', description: `Rends les ${ENTITIES[entity].label} extraites.`, input_schema: toolSchema(entity) }],
      tool_choice: { type: 'tool', name: 'rendre_lignes' },
    },
    { timeoutMs: 120_000, retries: 1 },
  )
  const input = toolInputOf(resp.content, 'rendre_lignes')
  if (!input) throw new Error("L'IA n'a rien renvoyé")
  return sanitizeLlmOutput(entity, input)
}

async function handle(req: Request): Promise<Response> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData.user) return json({ error: 'non authentifié' }, 401)

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return json({ error: 'corps JSON invalide' }, 400)
  const entity = body.entity
  if (!isImportEntity(entity)) return json({ error: 'entité inconnue' }, 400)
  const filename = typeof body.filename === 'string' ? body.filename.slice(0, 200) : 'fichier'
  const mime = typeof body.mime === 'string' ? body.mime.slice(0, 100) : ''
  const b64 = typeof body.content_base64 === 'string' ? body.content_base64 : ''
  if (!b64) return json({ error: 'fichier vide' }, 400)
  // taille approximative avant décodage (base64 ≈ 4/3)
  if (b64.length > (MAX_FILE_BYTES * 4) / 3 + 1024) return json({ error: 'fichier trop volumineux (max 6 Mo)' }, 413)

  let bytes: Uint8Array
  try {
    bytes = decodeBase64(b64)
  } catch {
    return json({ error: 'encodage du fichier invalide' }, 400)
  }
  if (bytes.length > MAX_FILE_BYTES) return json({ error: 'fichier trop volumineux (max 6 Mo)' }, 413)

  const kind = fileKind(filename, mime)
  let ex: Extracted
  try {
    ex = await extract(kind, bytes, b64, mime, filename)
  } catch (e) {
    console.error('extract', e)
    return json({ error: 'fichier illisible (format non reconnu ou corrompu). Formats tableur : .xlsx ou .csv' }, 422)
  }
  if (ex.kind === 'text' && !ex.text.trim()) return json({ error: 'document vide' }, 422)

  const meta = { kind, sheets: ex.kind === 'text' ? ex.sheets : [] }

  if (ANTHROPIC_KEY) {
    try {
      const result = await parseWithClaude(entity, ex)
      return json({ ...result, meta })
    } catch (e) {
      console.error('parseWithClaude', e)
      if (ex.kind !== 'text' || !ex.table) {
        return json({ error: `Analyse IA impossible : ${String((e as Error).message ?? e).slice(0, 200)}` }, 502)
      }
      const fallback = rowsFromTable(entity, ex.table)
      fallback.warnings.unshift("IA indisponible : lecture par en-têtes de colonnes (moins tolérante).")
      return json({ ...fallback, meta })
    }
  }

  if (ex.kind === 'text' && ex.table) {
    const r = rowsFromTable(entity, ex.table)
    r.warnings.unshift('ANTHROPIC_API_KEY non configurée : lecture par en-têtes de colonnes.')
    return json({ ...r, meta })
  }
  return json({ error: 'ANTHROPIC_API_KEY non configurée (requis pour PDF / image / texte libre)' }, 500)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)
  try {
    return await handle(req)
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
