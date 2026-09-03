import { describe, expect, it } from 'vitest'
import { buildMime, dotStuff, encodeHeader, formatAddress } from './smtp'

/** atob rend des octets bruts : il faut les relire en UTF-8 pour comparer du texte accentué. */
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))

const mail = {
  fromName: 'Au Coin du Feu',
  fromEmail: 'artisane@gmail.com',
  to: ['contact@laboutique.be'],
  cc: ['artisane@gmail.com'],
  subject: 'Bon de dépôt n° 2026-001',
  text: 'Bonjour,\nVoici le bon.',
}

describe('en-têtes', () => {
  it('laisse l’ASCII intact, encode le reste en RFC 2047', () => {
    expect(encodeHeader('Bon de depot 2026')).toBe('Bon de depot 2026')
    const encoded = encodeHeader('Bon de dépôt')
    expect(encoded).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
    expect(fromB64(encoded.slice(10, -2))).toBe('Bon de dépôt')
  })
  it('neutralise une injection de saut de ligne', () => {
    expect(encodeHeader('Objet\r\nBcc: pirate@example.com')).not.toMatch(/[\r\n]/)
  })
  it('formate les adresses', () => {
    expect(formatAddress('', 'a@b.be')).toBe('a@b.be')
    expect(formatAddress('Alex', 'a@b.be')).toBe('Alex <a@b.be>')
    expect(formatAddress('Épicerie', 'a@b.be')).toMatch(/^=\?UTF-8\?B\?.+\?= <a@b\.be>$/)
  })
})

describe('dotStuff', () => {
  it('double les points en début de ligne', () => {
    expect(dotStuff('a\n.\nb')).toBe('a\n..\nb')
    expect(dotStuff('.debut')).toBe('..debut')
    expect(dotStuff('milieu . point')).toBe('milieu . point')
  })
})

describe('buildMime', () => {
  const now = new Date(Date.UTC(2026, 8, 3, 10, 0, 0))

  it('message simple : corps en base64', () => {
    const m = buildMime(mail, now)
    expect(m).toContain('From: Au Coin du Feu <artisane@gmail.com>')
    expect(m).toContain('To: contact@laboutique.be')
    expect(m).toContain('Cc: artisane@gmail.com')
    expect(m).toContain('Content-Type: text/plain; charset=utf-8')
    const body = m.split('\r\n\r\n').slice(1).join('\r\n\r\n')
    expect(fromB64(body.replace(/\r\n/g, ''))).toContain('Voici le bon.')
  })

  it('pièce jointe : multipart avec frontière cohérente', () => {
    const m = buildMime({ ...mail, attachments: [{ filename: 'bon.pdf', contentType: 'application/pdf', base64: 'QUJD' }] }, now)
    const boundary = /boundary="([^"]+)"/.exec(m)?.[1]
    expect(boundary).toBeTruthy()
    expect(m.split(`--${boundary}`).length).toBe(4) // 2 parties + clôture
    expect(m).toContain('Content-Disposition: attachment; filename="bon.pdf"')
    expect(m.trimEnd().endsWith(`--${boundary}--`)).toBe(true)
  })

  it('coupe le base64 à 76 colonnes', () => {
    const m = buildMime({ ...mail, text: 'x'.repeat(500) }, now)
    for (const line of m.split('\r\n')) expect(line.length).toBeLessThanOrEqual(78)
  })

  it('Reply-To repris quand fourni', () => {
    expect(buildMime({ ...mail, replyTo: 'pro@aucoindufeu.be' }, now)).toContain('Reply-To: pro@aucoindufeu.be')
  })
})
