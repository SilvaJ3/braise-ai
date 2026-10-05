// Lecteur XLSX minimal, sans dépendance : zip (store/deflate via DecompressionStream natif)
// + XML OOXML (sharedStrings, styles pour les dates, worksheets). Pourquoi maison :
//  - le bundler Supabase refuse cdn.sheetjs.com (seule source officielle de SheetJS ≥ 0.20) ;
//  - `npm:xlsx` est figé en 0.18.5 avec deux CVE sur le parsing de fichiers non fiables.
// Couvre .xlsx / .xlsm (pas .xls binaire, .ods, .numbers). Valeurs rendues en texte, comme
// les affiche Excel (nombres bruts, dates en AAAA-MM-JJ, booléens en TRUE/FALSE).

export type Sheet = { name: string; rows: string[][] }

const SIG_EOCD = 0x06054b50
const SIG_CDIR = 0x02014b50
const SIG_LOCAL = 0x04034b50

type ZipEntry = { name: string; method: number; csize: number; usize: number; offset: number }

function readEntries(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  // EOCD : signature dans les derniers 64 Ko (commentaire possible)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip: EOCD introuvable')
  const count = dv.getUint16(eocd + 10, true)
  // Un classeur réel compte quelques dizaines d'entrées : 65 535 déclarées, c'est un fichier fabriqué.
  if (count > MAX_ENTREES) throw new Error('xlsx: trop d’entrées dans le zip')
  let p = dv.getUint32(eocd + 16, true)
  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== SIG_CDIR) throw new Error('zip: répertoire central corrompu')
    const method = dv.getUint16(p + 10, true)
    const csize = dv.getUint32(p + 20, true)
    const usize = dv.getUint32(p + 24, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const offset = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen))
    entries.push({ name, method, csize, usize, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

const MAX_XML_BYTES = 16 * 1024 * 1024 // garde-fou zip bomb : 500 lignes de tableur tiennent dans quelques Mo
const MAX_ENTREES = 2_000

/**
 * Décompresse en comptant les octets RÉELLEMENT produits et abandonne au-delà de `max`. La taille
 * déclarée dans le zip (`usize`) est écrite par l'expéditeur du fichier : elle ne prouve rien.
 */
async function inflate(data: Uint8Array, max: number): Promise<Uint8Array> {
  const lecteur = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const morceaux: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    total += value.length
    if (total > max) {
      await lecteur.cancel()
      throw new Error('xlsx: feuille trop volumineuse')
    }
    morceaux.push(value)
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const m of morceaux) {
    out.set(m, o)
    o += m.length
  }
  return out
}

async function readFile(buf: Uint8Array, e: ZipEntry, max: number): Promise<Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(e.offset, true) !== SIG_LOCAL) throw new Error('zip: en-tête local corrompu')
  const nameLen = dv.getUint16(e.offset + 26, true)
  const extraLen = dv.getUint16(e.offset + 28, true)
  const start = e.offset + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + e.csize)
  if (e.method === 0) {
    if (raw.length > max) throw new Error('xlsx: feuille trop volumineuse')
    return raw
  }
  if (e.method === 8) return await inflate(raw, max)
  throw new Error(`zip: compression ${e.method} non gérée`)
}

async function readText(buf: Uint8Array, entries: ZipEntry[], name: string): Promise<string | null> {
  const e = entries.find((x) => x.name === name)
  if (!e) return null
  if (e.usize > MAX_XML_BYTES) throw new Error('xlsx: feuille trop volumineuse') // refus rapide ; le vrai contrôle est dans inflate
  return new TextDecoder().decode(await readFile(buf, e, MAX_XML_BYTES))
}

// --- XML helpers (regex : suffisant pour OOXML généré par Excel / LibreOffice / Google) ---

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`))
  return m ? unescapeXml(m[1]) : null
}

/**
 * Les blocs `<tag …>…</tag>` d'un XML (un `<tag …/>` rend un bloc vide), en UNE passe avec indexOf.
 * Jamais de regex paresseuse ici : sur un XML sans balise fermante, une regex `<x>([\s\S]*?)</x>`
 * relit tout le reste du fichier à CHAQUE ouverture — quadratique, donc un fichier de quelques Mo
 * suffit à bloquer la fonction. Sans fermeture trouvée, on s'arrête.
 */
function* blocs(xml: string, tag: string): Generator<{ attrs: string; inner: string }> {
  const ouvre = `<${tag}`
  const ferme = `</${tag}>`
  let pos = 0
  for (;;) {
    const s = xml.indexOf(ouvre, pos)
    if (s < 0) return
    const apres = xml[s + ouvre.length]
    // `<c` ne doit pas s'arrêter sur `<cols>` ni `<t` sur `<tableParts>` : la balise finit là.
    if (apres !== ' ' && apres !== '>' && apres !== '/' && apres !== '\t' && apres !== '\n' && apres !== '\r') {
      pos = s + ouvre.length
      continue
    }
    const fin = xml.indexOf('>', s)
    if (fin < 0) return
    if (xml[fin - 1] === '/') {
      yield { attrs: xml.slice(s + ouvre.length, fin - 1), inner: '' }
      pos = fin + 1
      continue
    }
    const e = xml.indexOf(ferme, fin)
    if (e < 0) return
    yield { attrs: xml.slice(s + ouvre.length, fin), inner: xml.slice(fin + 1, e) }
    pos = e + ferme.length
  }
}

/** Texte concaténé de tous les <t> d'un fragment (rich text). */
function textOf(fragment: string): string {
  let out = ''
  for (const b of blocs(fragment, 't')) out += unescapeXml(b.inner)
  return out
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const out: string[] = []
  for (const b of blocs(xml, 'si')) out.push(textOf(b.inner))
  return out
}

// Styles : index cellXfs → est-ce un format date ?
const BUILTIN_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

function parseDateStyles(xml: string | null): boolean[] {
  if (!xml) return []
  const custom = new Map<number, string>()
  const nf = /<numFmt\s[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = nf.exec(xml))) {
    const id = Number(attr(m[0], 'numFmtId'))
    const code = attr(m[0], 'formatCode') ?? ''
    if (Number.isFinite(id)) custom.set(id, code)
  }
  const isDateCode = (code: string) => {
    const c = code.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '') // retire [Red], "texte"
    return /[dmyhs]/i.test(c) && !/[#0]/.test(c)
  }
  const xfsBlock = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? ''
  const out: boolean[] = []
  const xf = /<xf\s[^>]*\/?>/g
  while ((m = xf.exec(xfsBlock))) {
    const id = Number(attr(m[0], 'numFmtId') ?? '0')
    out.push(BUILTIN_DATE_FMT.has(id) || (custom.has(id) && isDateCode(custom.get(id) as string)))
  }
  return out
}

/** Numéro de série Excel (1900) → AAAA-MM-JJ (+ heure si fraction). */
export function serialToIso(n: number): string {
  // Excel compte le 29/02/1900 inexistant : décalage de 1 pour n >= 61
  const days = Math.floor(n) - (n >= 61 ? 25569 : 25568)
  const ms = Math.round((n - Math.floor(n)) * 86_400_000)
  const d = new Date(days * 86_400_000 + ms)
  const iso = d.toISOString()
  return ms ? iso.slice(0, 16).replace('T', ' ') : iso.slice(0, 10)
}

export function colIndex(ref: string): number {
  let n = 0
  for (const ch of ref) {
    const c = ch.charCodeAt(0)
    if (c < 65 || c > 90) break
    n = n * 26 + (c - 64)
  }
  return n - 1
}

const MAX_COLS = 16_384 // XFD, la dernière colonne d'Excel
const MAX_CELLULES = 500_000 // par feuille : 2 000 lignes × 250 colonnes

function parseSheet(xml: string, shared: string[], dateStyles: boolean[], maxRows: number): string[][] {
  const rows: string[][] = []
  let cellules = 0
  for (const ligne of blocs(xml, 'row')) {
    if (rows.length >= maxRows) break
    const row: string[] = []
    for (const cellule of blocs(ligne.inner, 'c')) {
      if (++cellules > MAX_CELLULES) return rows
      const tag = `<c${cellule.attrs}>`
      const ref = attr(tag, 'r') ?? ''
      const t = attr(tag, 't')
      const s = Number(attr(tag, 's') ?? '-1')
      const inner = cellule.inner
      const col = ref ? colIndex(ref) : row.length
      // Une référence hors du tableau (« ZZZZZZZ1 ») n'a pas de colonne : la cellule est ignorée. Sans cela,
      // le remplissage plus bas allouait des milliards de cases pour un fichier de quelques Ko.
      if (!(col >= 0 && col < MAX_COLS)) continue
      let value = ''
      if (t === 's') {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        value = v != null ? (shared[Number(v)] ?? '') : ''
      } else if (t === 'inlineStr') {
        value = textOf(inner)
      } else if (t === 'b') {
        value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] === '1' ? 'TRUE' : 'FALSE'
      } else if (t === 'e') {
        value = ''
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        if (v == null) value = ''
        else if (t === 'str' || t === 'd') value = unescapeXml(v)
        else {
          const n = Number(v)
          value = Number.isFinite(n) && dateStyles[s] ? serialToIso(n) : unescapeXml(v)
        }
      }
      while (row.length < col) row.push('')
      row[col] = value
    }
    if (row.some((v) => v.trim() !== '')) rows.push(row)
  }
  return rows
}

export async function readXlsx(buf: Uint8Array, opts: { maxRows?: number; maxSheets?: number } = {}): Promise<Sheet[]> {
  const maxRows = opts.maxRows ?? 2000
  const maxSheets = opts.maxSheets ?? 6
  const entries = readEntries(buf)
  const workbook = await readText(buf, entries, 'xl/workbook.xml')
  if (!workbook) throw new Error('xlsx: workbook.xml absent (fichier non xlsx ?)')
  const rels = (await readText(buf, entries, 'xl/_rels/workbook.xml.rels')) ?? ''
  const relTarget = new Map<string, string>()
  const relRe = /<Relationship\s[^>]*\/?>/g
  let m: RegExpExecArray | null
  while ((m = relRe.exec(rels))) {
    const id = attr(m[0], 'Id')
    const target = attr(m[0], 'Target')
    if (id && target) relTarget.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'))
  }
  const shared = parseSharedStrings(await readText(buf, entries, 'xl/sharedStrings.xml'))
  const dateStyles = parseDateStyles(await readText(buf, entries, 'xl/styles.xml'))

  const sheets: Sheet[] = []
  const sheetRe = /<sheet\s[^>]*\/?>/g
  let idx = 0
  while ((m = sheetRe.exec(workbook)) && sheets.length < maxSheets) {
    idx++
    const name = attr(m[0], 'name') ?? `Feuille ${idx}`
    const rid = attr(m[0], 'r:id') ?? attr(m[0], 'id')
    const path = (rid && relTarget.get(rid)) || `xl/worksheets/sheet${idx}.xml`
    const xml = await readText(buf, entries, path)
    if (!xml) continue
    const rows = parseSheet(xml, shared, dateStyles, maxRows)
    if (rows.length) sheets.push({ name, rows })
  }
  return sheets
}

/** Rendu texte type CSV (;) pour le prompt du LLM. */
export function sheetToCsv(rows: string[][], sep = ';'): string {
  const esc = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map((r) => r.map(esc).join(sep)).join('\n')
}
