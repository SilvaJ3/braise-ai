// Générateur PDF minimal, sans dépendance : une page A4, texte (Helvetica / Helvetica-Bold),
// traits, rectangles, image JPEG. Suffisant pour un bon de dépôt, et cohérent avec le reste
// des edge functions (le bundler Supabase refuse les CDN, et embarquer pdf-lib pour ça serait
// disproportionné).
// Repère utilisé par l'appelant : origine en HAUT à gauche, y vers le bas (comme à l'écran) ;
// la conversion vers le repère PDF (origine en bas) est faite ici.

export const A4 = { width: 595.28, height: 841.89 }

// --- Encodage WinAnsi ------------------------------------------------------------------------
// Les polices standard PDF n'acceptent pas l'UTF-8 : on convertit vers WinAnsiEncoding, qui
// couvre le français (é è à ç ô œ …), l'euro et les apostrophes typographiques.

const WINANSI_SPECIALS: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a,
  '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

/** Table inverse de `WINANSI_SPECIALS` (+ identité ASCII/Latin-1) : octet WinAnsi → point de code
 *  Unicode réellement rendu. Sert à construire le tableau `/Widths` d'une police custom. */
const WINANSI_BYTE_TO_UNICODE: number[] = (() => {
  const arr = Array.from<number>({ length: 256 }).fill(-1)
  for (let b = 0x20; b <= 0x7e; b++) arr[b] = b
  for (let b = 0xa0; b <= 0xff; b++) arr[b] = b
  for (const [ch, byte] of Object.entries(WINANSI_SPECIALS)) arr[byte] = ch.codePointAt(0) as number
  return arr
})()

export function toWinAnsi(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    const code = ch.codePointAt(0) as number
    if (code >= 0x20 && code <= 0x7e) out.push(code)
    else if (code >= 0xa0 && code <= 0xff) out.push(code)
    else if (WINANSI_SPECIALS[ch] != null) out.push(WINANSI_SPECIALS[ch])
    else if (ch === '\t') out.push(0x20)
    else if (code > 0x7e) out.push(0x3f) // '?' : caractère non représentable
  }
  return out
}

// --- Largeurs Helvetica (unités/1000) ---------------------------------------------------------
// Les accentués ont la largeur de leur lettre de base : on replie donc via une normalisation.

const W_REG: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333,
  ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278,
  '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469,
  _: 556, '`': 333, '{': 334, '|': 260, '}': 334, '~': 584, '€': 556, '’': 191, '“': 333,
  '”': 333, '–': 556, '—': 1000, '•': 350, '…': 1000,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667,
  L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667,
  W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500,
  l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500,
  w: 722, x: 500, y: 500, z: 500,
}

const W_BOLD: Record<string, number> = {
  ' ': 278, '!': 333, '"': 474, '#': 556, $: 556, '%': 889, '&': 722, "'": 238, '(': 333,
  ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 333, ';': 333,
  '<': 584, '=': 584, '>': 584, '?': 611, '@': 975, '[': 333, '\\': 278, ']': 333, '^': 584,
  _: 556, '`': 333, '{': 389, '|': 280, '}': 389, '~': 584, '€': 556, '’': 238, '“': 500,
  '”': 500, '–': 556, '—': 1000, '•': 350, '…': 1000,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722,
  L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667,
  W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556,
  l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556,
  w: 778, x: 556, y: 556, z: 500,
}

for (const d of [W_REG, W_BOLD]) for (const c of '0123456789') d[c] = 556

const base = (ch: string) => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function textWidth(s: string, size: number, bold = false): number {
  const table = bold ? W_BOLD : W_REG
  let w = 0
  for (const ch of s) w += table[ch] ?? table[base(ch)] ?? (bold ? 611 : 556)
  return (w * size) / 1000
}

/** Coupe un texte pour tenir dans `maxWidth`, aux espaces quand c'est possible. */
export function wrapText(s: string, maxWidth: number, size: number, bold = false): string[] {
  const lines: string[] = []
  for (const paragraph of s.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue
      const next = line ? `${line} ${word}` : word
      if (textWidth(next, size, bold) <= maxWidth || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

/** Tronque avec une ellipse si le texte dépasse. */
export function ellipsize(s: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxWidth) return s
  let out = s
  while (out.length > 1 && textWidth(`${out}…`, size, bold) > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}

// --- Polices TrueType embarquées ---------------------------------------------------------------
// On n'embarque que ce qu'il faut pour dessiner et mesurer du texte WinAnsi : la table cmap
// (code point → glyphe) et hmtx (glyphe → chasse). Le fichier .ttf est ensuite embarqué tel quel
// (FontFile2) — c'est au lecteur PDF de dessiner les contours, on ne touche jamais à glyf/loca.

type TtfTables = Record<string, { offset: number; length: number }>

function readTableDirectory(buf: DataView): TtfTables {
  const numTables = buf.getUint16(4)
  const tables: TtfTables = {}
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    const tag = String.fromCharCode(buf.getUint8(rec), buf.getUint8(rec + 1), buf.getUint8(rec + 2), buf.getUint8(rec + 3))
    tables[tag] = { offset: buf.getUint32(rec + 8), length: buf.getUint32(rec + 12) }
  }
  return tables
}

/** Résout, pour chaque point de code demandé, le glyphe via la sous-table cmap (3,1) ou (0,x). */
function readCmapUnicode(buf: DataView, tables: TtfTables, codepoints: Iterable<number>): Map<number, number> {
  const cmap = tables.cmap
  if (!cmap) throw new Error('police : table cmap manquante')
  const numTables = buf.getUint16(cmap.offset + 2)
  let sub = -1
  let bestScore = -1
  for (let i = 0; i < numTables; i++) {
    const rec = cmap.offset + 4 + i * 8
    const platformID = buf.getUint16(rec)
    const encodingID = buf.getUint16(rec + 2)
    const score = platformID === 3 && encodingID === 1 ? 2 : platformID === 0 ? 1 : 0
    if (score > bestScore) {
      bestScore = score
      sub = cmap.offset + buf.getUint32(rec + 4)
    }
  }
  if (sub < 0) throw new Error('police : sous-table cmap Unicode introuvable')
  const format = buf.getUint16(sub)
  if (format !== 4) throw new Error(`police : format cmap ${format} non géré`)
  const segCountX2 = buf.getUint16(sub + 6)
  const segCount = segCountX2 / 2
  const endCodeAt = sub + 14
  const startCodeAt = endCodeAt + segCountX2 + 2
  const idDeltaAt = startCodeAt + segCountX2
  const idRangeOffsetAt = idDeltaAt + segCountX2
  const out = new Map<number, number>()
  for (const code of codepoints) {
    for (let i = 0; i < segCount; i++) {
      const end = buf.getUint16(endCodeAt + i * 2)
      if (code > end) continue
      const start = buf.getUint16(startCodeAt + i * 2)
      if (code < start) break
      const idDelta = buf.getInt16(idDeltaAt + i * 2)
      const idRangeOffset = buf.getUint16(idRangeOffsetAt + i * 2)
      let glyph = 0
      if (idRangeOffset === 0) glyph = (code + idDelta) & 0xffff
      else {
        const addr = idRangeOffsetAt + i * 2 + idRangeOffset + (code - start) * 2
        const g = buf.getUint16(addr)
        glyph = g === 0 ? 0 : (g + idDelta) & 0xffff
      }
      if (glyph) out.set(code, glyph)
      break
    }
  }
  return out
}

/** Chasse (advance width) de chaque glyphe demandé, en unités de la police. */
function readHmtx(buf: DataView, tables: TtfTables, glyphIds: Iterable<number>): Map<number, number> {
  const hhea = tables.hhea
  const hmtx = tables.hmtx
  if (!hhea || !hmtx) throw new Error('police : tables hhea/hmtx manquantes')
  const numH = buf.getUint16(hhea.offset + 34)
  const out = new Map<number, number>()
  for (const g of glyphIds) out.set(g, buf.getUint16(hmtx.offset + Math.min(g, numH - 1) * 4))
  return out
}

/** Points de code couverts par WinAnsiEncoding — c'est tout ce que `toWinAnsi` peut produire. */
const WINANSI_CODEPOINTS: number[] = (() => {
  const out: number[] = []
  for (let c = 0x20; c <= 0x7e; c++) out.push(c)
  for (let c = 0xa0; c <= 0xff; c++) out.push(c)
  for (const ch of Object.keys(WINANSI_SPECIALS)) out.push(ch.codePointAt(0) as number)
  return out
})()

/** Reproduit la logique de `toWinAnsi`, mais renvoie le point de code réel (pas l'octet) — sert à
 *  mesurer avec la police effectivement utilisée pour dessiner. */
function representableCodepoints(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    const code = ch.codePointAt(0) as number
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_SPECIALS[ch] != null) out.push(code)
    else out.push(ch === '\t' ? 0x20 : 0x3f)
  }
  return out
}

export type LoadedFont = {
  bytes: Uint8Array
  name: string
  unitsPerEm: number
  ascent: number
  descent: number
  capHeight: number
  italicAngle: number
  bbox: [number, number, number, number]
  bold: boolean
  italic: boolean
  serif: boolean
  widthOf: (codepoint: number) => number // unités/1000, comparable aux tables Helvetica
}

/** Décode un .ttf (WinAnsi uniquement) pour l'embarquer dans le PDF. */
export function loadFont(
  bytes: Uint8Array,
  meta: { name: string; bold?: boolean; italic?: boolean; serif?: boolean },
): LoadedFont {
  const buf = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tables = readTableDirectory(buf)
  const head = tables.head
  if (!head) throw new Error('police : table head manquante')
  const unitsPerEm = buf.getUint16(head.offset + 18)
  const bbox: [number, number, number, number] = [
    buf.getInt16(head.offset + 36),
    buf.getInt16(head.offset + 38),
    buf.getInt16(head.offset + 40),
    buf.getInt16(head.offset + 42),
  ]
  const hhea = tables.hhea
  const ascent = hhea ? buf.getInt16(hhea.offset + 4) : Math.round(unitsPerEm * 0.8)
  const descent = hhea ? buf.getInt16(hhea.offset + 6) : -Math.round(unitsPerEm * 0.2)
  let italicAngle = 0
  if (tables.post) italicAngle = buf.getInt32(tables.post.offset + 4) / 65536
  let capHeight = Math.round(ascent * 0.7)
  const os2 = tables['OS/2']
  if (os2 && os2.length >= 90 && buf.getUint16(os2.offset) >= 2) capHeight = buf.getInt16(os2.offset + 88)

  const cmap = readCmapUnicode(buf, tables, WINANSI_CODEPOINTS)
  const glyphIds = new Set(cmap.values())
  const hmtx = readHmtx(buf, tables, glyphIds)

  return {
    bytes,
    name: meta.name,
    unitsPerEm,
    ascent,
    descent,
    capHeight,
    italicAngle,
    bbox,
    bold: meta.bold ?? false,
    italic: meta.italic ?? false,
    serif: meta.serif ?? false,
    widthOf: (codepoint) => {
      const glyph = cmap.get(codepoint)
      const advance = glyph != null ? hmtx.get(glyph) ?? 0 : 0
      return Math.round((advance * 1000) / unitsPerEm)
    },
  }
}

export function textWidthFont(s: string, size: number, font: LoadedFont): number {
  let w = 0
  for (const code of representableCodepoints(s)) w += font.widthOf(code)
  return (w * size) / 1000
}

export function wrapTextFont(s: string, maxWidth: number, size: number, font: LoadedFont): string[] {
  const lines: string[] = []
  for (const paragraph of s.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue
      const next = line ? `${line} ${word}` : word
      if (textWidthFont(next, size, font) <= maxWidth || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

export function ellipsizeFont(s: string, maxWidth: number, size: number, font: LoadedFont): string {
  if (textWidthFont(s, size, font) <= maxWidth) return s
  let out = s
  while (out.length > 1 && textWidthFont(`${out}…`, size, font) > maxWidth) out = out.slice(0, -1)
  return `${out}…`
}

// --- Taille d'un JPEG -------------------------------------------------------------------------

export function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('image: JPEG attendu')
  let i = 2
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    // SOF0..SOF15, hors marqueurs non-SOF (DHT c4, JPG c8, DAC cc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] }
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3])
  }
  throw new Error('image: dimensions JPEG introuvables')
}

// --- Document ----------------------------------------------------------------------------------

export type TextOpts = {
  size?: number
  bold?: boolean
  /** Police custom embarquée (LoadedFont) : prioritaire sur `bold` (qui reste Helvetica). */
  font?: LoadedFont
  align?: 'left' | 'right' | 'center'
  color?: [number, number, number]
  /** Approche du letter-spacing CSS, en points absolus (ex. size * 0.09 pour un `0.09em`). */
  tracking?: number
}

type Img = { bytes: Uint8Array; width: number; height: number }
type ShapeOpts = { fill?: [number, number, number]; stroke?: [number, number, number]; strokeWidth?: number }

const esc = (codes: number[]): string =>
  codes
    .map((c) => (c === 0x28 || c === 0x29 || c === 0x5c ? `\\${String.fromCharCode(c)}` : String.fromCharCode(c)))
    .join('')

export class PdfDoc {
  private pages: string[][] = [[]]
  private current = 0
  private images: Img[] = []
  private customFonts: LoadedFont[] = []
  readonly width = A4.width
  readonly height = A4.height

  private get ops(): string[] {
    return this.pages[this.current]
  }

  private fontResourceName(font: LoadedFont): string {
    let idx = this.customFonts.indexOf(font)
    if (idx === -1) {
      this.customFonts.push(font)
      idx = this.customFonts.length - 1
    }
    return `/FC${idx}`
  }

  /** Ouvre une nouvelle page ; tout ce qui est dessiné ensuite y va. */
  addPage(): void {
    this.pages.push([])
    this.current = this.pages.length - 1
  }

  /** Revient dessiner sur une page déjà créée (0 = première) — pieds de page, filigranes. */
  setPage(i: number): void {
    if (i >= 0 && i < this.pages.length) this.current = i
  }

  get pageCount(): number {
    return this.pages.length
  }

  private y(top: number): number {
    return this.height - top
  }

  text(x: number, top: number, s: string, o: TextOpts = {}): void {
    const size = o.size ?? 10
    const tracking = o.tracking ?? 0
    const fontRes = o.font ? this.fontResourceName(o.font) : o.bold ? '/F2' : '/F1'
    const w = (o.font ? textWidthFont(s, size, o.font) : textWidth(s, size, o.bold)) + tracking * s.length
    let px = x
    if (o.align === 'right') px = x - w
    else if (o.align === 'center') px = x - w / 2
    const [r, g, b] = o.color ?? [0, 0, 0]
    this.ops.push(
      `BT ${r} ${g} ${b} rg ${tracking.toFixed(2)} Tc ${fontRes} ${size} Tf 1 0 0 1 ${px.toFixed(2)} ${this.y(top + size * 0.8).toFixed(2)} Tm (${esc(toWinAnsi(s))}) Tj ET`,
    )
  }

  /** Paragraphe justifié à gauche ; renvoie la hauteur occupée. */
  paragraph(x: number, top: number, s: string, maxWidth: number, o: TextOpts & { leading?: number } = {}): number {
    const size = o.size ?? 10
    const leading = o.leading ?? size * 1.35
    const lines = o.font ? wrapTextFont(s, maxWidth, size, o.font) : wrapText(s, maxWidth, size, o.bold)
    lines.forEach((l, i) => this.text(x, top + i * leading, l, o))
    return lines.length * leading
  }

  line(x1: number, top1: number, x2: number, top2: number, w = 0.7, color: [number, number, number] = [0, 0, 0]): void {
    const [r, g, b] = color
    this.ops.push(
      `${r} ${g} ${b} RG ${w} w ${x1.toFixed(2)} ${this.y(top1).toFixed(2)} m ${x2.toFixed(2)} ${this.y(top2).toFixed(2)} l S`,
    )
  }

  rect(x: number, top: number, w: number, h: number, fill: [number, number, number]): void {
    const [r, g, b] = fill
    this.ops.push(`${r} ${g} ${b} rg ${x.toFixed(2)} ${this.y(top + h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  }

  /** Ouvre le tracé (fond et/ou trait) courant à partir des options de forme communes. */
  private strokeFillPrelude(o: ShapeOpts): string[] {
    const ops: string[] = []
    if (o.fill) ops.push(`${o.fill[0]} ${o.fill[1]} ${o.fill[2]} rg`)
    if (o.stroke) ops.push(`${o.stroke[0]} ${o.stroke[1]} ${o.stroke[2]} RG ${(o.strokeWidth ?? 1).toFixed(2)} w`)
    return ops
  }

  private paintOp(o: ShapeOpts): string {
    return o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'
  }

  /** Cercle plein et/ou tracé (monogramme). `topCy` : distance du centre depuis le haut de page. */
  circle(cx: number, topCy: number, r: number, o: ShapeOpts): void {
    const k = 0.5522847498 * r
    const cy = this.y(topCy)
    const p = (px: number, py: number) => `${px.toFixed(2)} ${py.toFixed(2)}`
    const ops = this.strokeFillPrelude(o)
    ops.push(
      `${p(cx, cy + r)} m`,
      `${p(cx + k, cy + r)} ${p(cx + r, cy + k)} ${p(cx + r, cy)} c`,
      `${p(cx + r, cy - k)} ${p(cx + k, cy - r)} ${p(cx, cy - r)} c`,
      `${p(cx - k, cy - r)} ${p(cx - r, cy - k)} ${p(cx - r, cy)} c`,
      `${p(cx - r, cy + k)} ${p(cx - k, cy + r)} ${p(cx, cy + r)} c`,
      'h',
      this.paintOp(o),
    )
    this.ops.push(ops.join(' '))
  }

  /** Rectangle à coins arrondis, plein et/ou tracé (cadre signature). */
  roundedRect(x: number, top: number, w: number, h: number, radius: number, o: ShapeOpts): void {
    const r = Math.min(radius, w / 2, h / 2)
    const k = 0.5522847498 * r
    const yTop = this.y(top)
    const yBot = this.y(top + h)
    const xL = x
    const xR = x + w
    const p = (px: number, py: number) => `${px.toFixed(2)} ${py.toFixed(2)}`
    const ops = this.strokeFillPrelude(o)
    ops.push(
      `${p(xL + r, yTop)} m`,
      `${p(xR - r, yTop)} l`,
      `${p(xR - r + k, yTop)} ${p(xR, yTop - r + k)} ${p(xR, yTop - r)} c`,
      `${p(xR, yBot + r)} l`,
      `${p(xR, yBot + r - k)} ${p(xR - r + k, yBot)} ${p(xR - r, yBot)} c`,
      `${p(xL + r, yBot)} l`,
      `${p(xL + r - k, yBot)} ${p(xL, yBot + r - k)} ${p(xL, yBot + r)} c`,
      `${p(xL, yTop - r)} l`,
      `${p(xL, yTop - r + k)} ${p(xL + r - k, yTop)} ${p(xL + r, yTop)} c`,
      'h',
      this.paintOp(o),
    )
    this.ops.push(ops.join(' '))
  }

  /** Place un JPEG dans un cadre, en conservant ses proportions (ajusté au plus contraint). */
  jpeg(bytes: Uint8Array, x: number, top: number, maxW: number, maxH: number): void {
    const { width, height } = jpegSize(bytes)
    const scale = Math.min(maxW / width, maxH / height)
    const w = width * scale
    const h = height * scale
    this.images.push({ bytes, width, height })
    const name = `/Im${this.images.length}`
    this.ops.push(
      `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${this.y(top + h).toFixed(2)} cm ${name} Do Q`,
    )
  }

  save(): Uint8Array {
    // Tout le fichier s'écrit en octets bruts : les chaînes de contenu portent déjà des codes
    // WinAnsi (é = 0xE9), qu'un encodage UTF-8 casserait en deux octets.
    const enc = { encode: latin1 }
    const P = this.pages.length
    const C = this.customFonts.length
    // Numérotation : 1 catalogue, 2 arbre de pages, puis P pages, P flux de contenu, les 2
    // polices standard, 3 objets par police custom (Font/FontDescriptor/FontFile2), et enfin
    // une image par objet.
    const pageObj = (i: number) => 3 + i
    const contentObj = (i: number) => 3 + P + i
    const fontRegular = 3 + 2 * P
    const fontBold = fontRegular + 1
    const customFontStart = fontBold + 1
    const customFontObj = (i: number, part: 0 | 1 | 2) => customFontStart + i * 3 + part
    const imgObj = (i: number) => customFontStart + C * 3 + i

    const xobjects = this.images.map((_, i) => `/Im${i + 1} ${imgObj(i)} 0 R`).join(' ')
    const customFontRes = this.customFonts.map((_, i) => `/FC${i} ${customFontObj(i, 0)} 0 R`).join(' ')
    const kids = this.pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')

    const objects: Uint8Array[] = [
      enc.encode('<< /Type /Catalog /Pages 2 0 R >>'),
      enc.encode(`<< /Type /Pages /Kids [${kids}] /Count ${P} >>`),
    ]
    for (let i = 0; i < P; i++) {
      objects.push(
        enc.encode(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width.toFixed(2)} ${this.height.toFixed(2)}] ` +
            `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R ${customFontRes} >> ` +
            `/XObject << ${xobjects} >> >> /Contents ${contentObj(i)} 0 R >>`,
        ),
      )
    }
    for (const ops of this.pages) {
      const content = enc.encode(ops.join('\n'))
      objects.push(
        concat([enc.encode(`<< /Length ${content.length} >>\nstream\n`), content, enc.encode('\nendstream')]),
      )
    }
    objects.push(
      enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    )
    this.customFonts.forEach((font, i) => {
      const widths: number[] = []
      for (let b = 32; b <= 255; b++) {
        const cp = WINANSI_BYTE_TO_UNICODE[b]
        widths.push(cp < 0 ? 0 : font.widthOf(cp))
      }
      let flags = 32 // Nonsymbolic
      if (font.serif) flags |= 2
      if (font.italic) flags |= 64
      if (font.bold) flags |= 262144
      objects.push(
        enc.encode(
          `<< /Type /Font /Subtype /TrueType /BaseFont /${font.name} /FirstChar 32 /LastChar 255 ` +
            `/Widths [${widths.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${customFontObj(i, 1)} 0 R >>`,
        ),
        enc.encode(
          `<< /Type /FontDescriptor /FontName /${font.name} /Flags ${flags} ` +
            `/FontBBox [${font.bbox.join(' ')}] /ItalicAngle ${font.italicAngle} /Ascent ${font.ascent} ` +
            `/Descent ${font.descent} /CapHeight ${font.capHeight} /StemV ${font.bold ? 120 : 80} ` +
            `/FontFile2 ${customFontObj(i, 2)} 0 R >>`,
        ),
        concat([
          enc.encode(`<< /Length ${font.bytes.length} /Length1 ${font.bytes.length} >>\nstream\n`),
          font.bytes,
          enc.encode('\nendstream'),
        ]),
      )
    })
    for (const img of this.images) {
      objects.push(
        concat([
          enc.encode(
            `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
              `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`,
          ),
          img.bytes,
          enc.encode('\nendstream'),
        ]),
      )
    }

    // En-tête : la ligne de commentaire binaire signale un fichier non-ASCII aux outils.
    const parts: Uint8Array[] = [
      enc.encode('%PDF-1.4\n'),
      new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
    ]
    let pos = parts[0].length + parts[1].length
    const offsets: number[] = []
    objects.forEach((body, i) => {
      offsets.push(pos)
      const head = enc.encode(`${i + 1} 0 obj\n`)
      const tail = enc.encode('\nendobj\n')
      parts.push(head, body, tail)
      pos += head.length + body.length + tail.length
    })

    const size = objects.length + 1
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`
    for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
    xref += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`
    parts.push(enc.encode(xref))
    return concat(parts)
  }
}

/** Un caractère → un octet. Le reste du fichier PDF est de l'ASCII, donc sans perte. */
function latin1(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}
