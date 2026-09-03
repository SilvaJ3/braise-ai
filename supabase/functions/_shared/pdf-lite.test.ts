import { describe, expect, it } from 'vitest'
import { PdfDoc, ellipsize, jpegSize, textWidth, toWinAnsi, wrapText } from './pdf-lite'

// JPEG 1×1 valide, utilisé comme fausse signature.
export const JPEG_1PX =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

export const jpegBytes = (b64 = JPEG_1PX) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

describe('toWinAnsi', () => {
  it('garde l’ASCII, mappe le latin-1 et les caractères Windows', () => {
    expect(toWinAnsi('abc')).toEqual([97, 98, 99])
    expect(toWinAnsi('é')).toEqual([0xe9])
    expect(toWinAnsi('ô')).toEqual([0xf4])
    expect(toWinAnsi('€')).toEqual([0x80])
    expect(toWinAnsi('’')).toEqual([0x92])
    expect(toWinAnsi('œ')).toEqual([0x9c])
  })
  it('remplace ce qui n’est pas représentable', () => {
    expect(toWinAnsi('日')).toEqual([0x3f])
    expect(toWinAnsi('🔥')).toEqual([0x3f])
  })
})

describe('métriques de texte', () => {
  it('largeurs Helvetica connues', () => {
    expect(textWidth('A', 10)).toBeCloseTo(6.67, 2)
    expect(textWidth(' ', 10)).toBeCloseTo(2.78, 2)
    expect(textWidth('AAA', 20)).toBeCloseTo(40.02, 2)
  })
  it('un accent ne change pas la largeur de la lettre', () => {
    expect(textWidth('é', 10)).toBeCloseTo(textWidth('e', 10), 5)
    expect(textWidth('ç', 10)).toBeCloseTo(textWidth('c', 10), 5)
  })
  it('le gras est plus large', () => {
    expect(textWidth('Bougie', 10, true)).toBeGreaterThan(textWidth('Bougie', 10, false))
  })
  it('wrapText coupe aux espaces et respecte la largeur', () => {
    const lines = wrapText('Grande bougie parfumée de la collection hiver', 80, 9)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(textWidth(l, 9)).toBeLessThanOrEqual(80)
  })
  it('wrapText garde un mot trop long plutôt que de le perdre', () => {
    expect(wrapText('anticonstitutionnellement', 10, 9)).toEqual(['anticonstitutionnellement'])
  })
  it('wrapText respecte les retours à la ligne', () => {
    expect(wrapText('a\nb', 500, 9)).toEqual(['a', 'b'])
  })
  it('ellipsize tronque au-delà de la largeur', () => {
    const s = ellipsize('Suspension parfumée très longue', 40, 9)
    expect(s.endsWith('…')).toBe(true)
    expect(textWidth(s, 9)).toBeLessThanOrEqual(40)
    expect(ellipsize('court', 200, 9)).toBe('court')
  })
})

describe('jpegSize', () => {
  it('lit les dimensions', () => {
    expect(jpegSize(jpegBytes())).toEqual({ width: 1, height: 1 })
  })
  it('rejette ce qui n’est pas un JPEG', () => {
    expect(() => jpegSize(new Uint8Array([1, 2, 3, 4]))).toThrow(/JPEG/)
  })
})

describe('PdfDoc', () => {
  const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

  it('produit un fichier PDF structuré', () => {
    const doc = new PdfDoc()
    doc.text(50, 50, 'Bon de dépôt', { size: 14, bold: true })
    const bytes = doc.save()
    const s = text(bytes)
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(s).toContain('/Type /Catalog')
    expect(s).toContain('/BaseFont /Helvetica-Bold')
    expect(s).toContain('startxref')
  })

  it('les offsets xref pointent bien sur les objets', () => {
    const doc = new PdfDoc()
    doc.text(10, 10, 'x')
    const bytes = doc.save()
    const s = text(bytes)
    const xrefPos = Number(/startxref\n(\d+)/.exec(s)![1])
    expect(s.slice(xrefPos, xrefPos + 4)).toBe('xref')
    const offsets = [...s.slice(xrefPos).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets.length).toBeGreaterThan(4)
    offsets.forEach((off, i) => expect(s.slice(off, off + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)))
  })

  it('échappe les parenthèses du texte', () => {
    const doc = new PdfDoc()
    doc.text(10, 10, 'Bougie (grande)')
    expect(text(doc.save())).toContain('(Bougie \\(grande\\)) Tj')
  })

  it('compte les pages et référence l’image', () => {
    const doc = new PdfDoc()
    doc.text(10, 10, 'p1')
    doc.jpeg(jpegBytes(), 10, 20, 100, 40)
    doc.addPage()
    doc.text(10, 10, 'p2')
    expect(doc.pageCount).toBe(2)
    const s = text(doc.save())
    expect(s).toContain('/Count 2')
    expect(s).toContain('/Subtype /Image')
    expect(s).toContain('/Filter /DCTDecode')
    expect(s).toContain('/Im1')
  })

  it('setPage revient dessiner sur une page précédente', () => {
    const doc = new PdfDoc()
    doc.text(10, 10, 'page-un')
    doc.addPage()
    doc.text(10, 10, 'page-deux')
    doc.setPage(0)
    doc.text(10, 30, 'ajout-tardif')
    const s = text(doc.save())
    const i1 = s.indexOf('ajout-tardif')
    const i2 = s.indexOf('page-deux')
    expect(i1).toBeGreaterThan(-1)
    expect(i1).toBeLessThan(i2) // l'ajout est dans le flux de la page 1
  })
})
