// Import universel (V3) côté client : envoi du fichier à l'edge function `import`, plan
// (nouveau / mise à jour) contre l'existant, application via RLS.
import {
  ENTITIES,
  dedupeKeyOf,
  normKey,
  parseCsv,
  rowsFromTable,
  type ImportEntity,
  type ImportResult,
  type ImportRow,
} from '../../supabase/functions/_shared/import-entities'
import { functionErrorMessage } from './push'
import { supabase } from './supabase'

export { ENTITIES, IMPORT_ENTITIES, ACCEPTED_EXTENSIONS, MAX_FILE_BYTES } from '../../supabase/functions/_shared/import-entities'
export type { ImportEntity, ImportResult, ImportRow } from '../../supabase/functions/_shared/import-entities'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('Lecture du fichier impossible'))
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.readAsDataURL(file)
  })
}

/** Analyse un fichier via l'edge function (IA). Secours local par en-têtes si CSV et serveur KO. */
export async function analyseFile(entity: ImportEntity, file: File): Promise<ImportResult> {
  const content_base64 = await fileToBase64(file)
  const { data, error } = await supabase.functions.invoke('import', {
    body: { entity, filename: file.name, mime: file.type, content_base64 },
  })
  if (error) {
    const msg = await functionErrorMessage(error)
    const local = await localFallback(entity, file)
    if (local) {
      local.warnings.unshift(`Serveur indisponible (${msg}) : lecture locale par en-têtes de colonnes.`)
      return local
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(String(data.error))
  const result = data as ImportResult
  if (!Array.isArray(result?.rows)) throw new Error('Réponse inattendue du serveur')
  return result
}

async function localFallback(entity: ImportEntity, file: File): Promise<ImportResult | null> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!['csv', 'tsv', 'txt'].includes(ext)) return null
  try {
    const text = await file.text()
    return rowsFromTable(entity, parseCsv(text))
  } catch {
    return null
  }
}

// --- Plan d'import : nouveau / mise à jour ---------------------------------------------

export type PlanItem = {
  row: ImportRow
  action: 'nouveau' | 'maj'
  existingId: string | null
  /** champs qui changent réellement (maj) */
  changes: string[]
  selected: boolean
}

type Existing = Record<string, unknown> & { id: string }

async function loadExisting(entity: ImportEntity): Promise<Existing[]> {
  const table = ENTITIES[entity].table
  const { data, error } = await supabase.from(table).select('*')
  if (error) throw error
  return (data ?? []) as Existing[]
}

function existingKeyIndex(entity: ImportEntity, existing: Existing[]): Map<string, Existing> {
  const idx = new Map<string, Existing>()
  for (const e of existing) {
    for (const k of ENTITIES[entity].dedupeKeys) {
      const v = e[k]
      if (typeof v === 'string' && v.trim()) {
        const key = `${k}:${normKey(v)}`
        if (!idx.has(key)) idx.set(key, e)
      }
    }
  }
  return idx
}

/** Valeur telle qu'elle sera écrite en base pour un champ importé. */
function dbValue(entity: ImportEntity, key: string, v: ImportRow[string]): unknown {
  if (entity === 'boutiques' && key === 'horaires') return v ? { note: String(v) } : null
  return v
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a == null && (b == null || b === '')) return true
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return String(a).trim() === String(b).trim()
}

export async function buildPlan(entity: ImportEntity, rows: ImportRow[]): Promise<PlanItem[]> {
  const existing = await loadExisting(entity)
  const idx = existingKeyIndex(entity, existing)
  return rows.map((row) => {
    let match: Existing | undefined
    for (const k of ENTITIES[entity].dedupeKeys) {
      const v = row[k]
      if (typeof v === 'string' && v.trim()) {
        match = idx.get(`${k}:${normKey(v)}`)
        if (match) break
      }
    }
    if (!match) return { row, action: 'nouveau', existingId: null, changes: [], selected: true }
    const changes = Object.keys(row).filter((k) => {
      if (k === 'fournisseur_nom') return false
      const nv = row[k]
      // on n'écrase pas une valeur existante par du vide
      if (nv == null || nv === '') return false
      // horaires (boutiques) est stocké en jsonb { note }
      const ev = k === 'horaires' ? ((match![k] as { note?: string } | null)?.note ?? null) : match![k]
      return !sameValue(ev, nv)
    })
    return { row, action: 'maj', existingId: match.id, changes, selected: changes.length > 0 }
  })
}

// --- Application ------------------------------------------------------------------------

export type ApplyResult = { created: number; updated: number; fournisseursCrees: number; errors: string[] }

function toRecord(entity: ImportEntity, row: ImportRow, forUpdate: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'fournisseur_nom') continue
    const dv = dbValue(entity, k, v)
    if (forUpdate && (dv == null || dv === '')) continue // jamais écraser par du vide
    out[k] = dv
  }
  if (entity === 'matieres_premieres' && !forUpdate && out.stock_actuel == null) out.stock_actuel = 0
  if (entity === 'matieres_premieres' && !forUpdate && out.unite == null) out.unite = 'g'
  if (forUpdate && entity === 'matieres_premieres') delete out.unite // ne pas changer l'unité d'une matière existante en silence
  return out
}

/** Fournisseurs référencés par les matières : résolus par nom, créés s'ils n'existent pas. */
async function resolveFournisseurs(items: PlanItem[]): Promise<{ byName: Map<string, string>; created: number }> {
  const names = new Set<string>()
  for (const it of items) {
    const n = it.row.fournisseur_nom
    if (typeof n === 'string' && n.trim()) names.add(n.trim())
  }
  const byName = new Map<string, string>()
  if (!names.size) return { byName, created: 0 }
  const { data, error } = await supabase.from('fournisseurs').select('id, nom')
  if (error) throw error
  for (const f of data ?? []) byName.set(normKey(f.nom as string), f.id as string)
  let created = 0
  for (const n of names) {
    if (byName.has(normKey(n))) continue
    const { data: ins, error: e } = await supabase.from('fournisseurs').insert({ nom: n }).select('id').single()
    if (e || !ins) continue
    byName.set(normKey(n), ins.id as string)
    created++
  }
  return { byName, created }
}

const BATCH = 50

export async function applyPlan(entity: ImportEntity, items: PlanItem[]): Promise<ApplyResult> {
  const table = ENTITIES[entity].table
  const selected = items.filter((i) => i.selected)
  const result: ApplyResult = { created: 0, updated: 0, fournisseursCrees: 0, errors: [] }
  if (!selected.length) return result

  let fournisseurs = new Map<string, string>()
  if (entity === 'matieres_premieres') {
    const r = await resolveFournisseurs(selected)
    fournisseurs = r.byName
    result.fournisseursCrees = r.created
  }

  const withFournisseur = (row: ImportRow, rec: Record<string, unknown>) => {
    if (entity !== 'matieres_premieres') return rec
    const n = row.fournisseur_nom
    const id = typeof n === 'string' && n.trim() ? fournisseurs.get(normKey(n)) : undefined
    if (id) rec.fournisseur_id = id
    return rec
  }

  const inserts = selected
    .filter((i) => i.action === 'nouveau')
    .map((i) => withFournisseur(i.row, toRecord(entity, i.row, false)))
  for (let i = 0; i < inserts.length; i += BATCH) {
    const chunk = inserts.slice(i, i + BATCH)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) {
      // en cas d'échec du lot (ex. doublon), on réessaie ligne par ligne pour isoler l'erreur
      for (const rec of chunk) {
        const { error: e1 } = await supabase.from(table).insert(rec)
        if (e1) result.errors.push(`${String(rec.nom)} : ${e1.message}`)
        else result.created++
      }
    } else result.created += chunk.length
  }

  for (const it of selected.filter((i) => i.action === 'maj' && i.existingId)) {
    const rec = withFournisseur(it.row, toRecord(entity, it.row, true))
    if (!Object.keys(rec).length) continue
    const { error } = await supabase.from(table).update(rec).eq('id', it.existingId as string)
    if (error) result.errors.push(`${String(it.row.nom)} : ${error.message}`)
    else result.updated++
  }
  return result
}

export const rowKey = (entity: ImportEntity, row: ImportRow, i: number) => dedupeKeyOf(entity, row) ?? `row-${i}`
