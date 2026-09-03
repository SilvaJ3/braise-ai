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
  align?: 'left' | 'right' | 'center'
  color?: [number, number, number]
}

type Img = { bytes: Uint8Array; width: number; height: number }

const esc = (codes: number[]): string =>
  codes
    .map((c) => (c === 0x28 || c === 0x29 || c === 0x5c ? `\\${String.fromCharCode(c)}` : String.fromCharCode(c)))
    .join('')

export class PdfDoc {
  private pages: string[][] = [[]]
  private current = 0
  private images: Img[] = []
  readonly width = A4.width
  readonly height = A4.height

  private get ops(): string[] {
    return this.pages[this.current]
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
    const font = o.bold ? '/F2' : '/F1'
    let px = x
    if (o.align === 'right') px = x - textWidth(s, size, o.bold)
    else if (o.align === 'center') px = x - textWidth(s, size, o.bold) / 2
    const [r, g, b] = o.color ?? [0, 0, 0]
    this.ops.push(
      `BT ${r} ${g} ${b} rg ${font} ${size} Tf 1 0 0 1 ${px.toFixed(2)} ${this.y(top + size * 0.8).toFixed(2)} Tm (${esc(toWinAnsi(s))}) Tj ET`,
    )
  }

  /** Paragraphe justifié à gauche ; renvoie la hauteur occupée. */
  paragraph(x: number, top: number, s: string, maxWidth: number, o: TextOpts & { leading?: number } = {}): number {
    const size = o.size ?? 10
    const leading = o.leading ?? size * 1.35
    const lines = wrapText(s, maxWidth, size, o.bold)
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
    // Numérotation : 1 catalogue, 2 arbre de pages, puis P pages, P flux de contenu,
    // les 2 polices, et enfin une image par objet.
    const pageObj = (i: number) => 3 + i
    const contentObj = (i: number) => 3 + P + i
    const fontRegular = 3 + 2 * P
    const fontBold = fontRegular + 1
    const imgObj = (i: number) => fontBold + 1 + i

    const xobjects = this.images.map((_, i) => `/Im${i + 1} ${imgObj(i)} 0 R`).join(' ')
    const kids = this.pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')

    const objects: Uint8Array[] = [
      enc.encode('<< /Type /Catalog /Pages 2 0 R >>'),
      enc.encode(`<< /Type /Pages /Kids [${kids}] /Count ${P} >>`),
    ]
    for (let i = 0; i < P; i++) {
      objects.push(
        enc.encode(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width.toFixed(2)} ${this.height.toFixed(2)}] ` +
            `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> ` +
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
