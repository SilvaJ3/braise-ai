// Client SMTP minimal (TLS direct, port 465) + construction du message MIME.
// Pourquoi maison : les libs SMTP Deno passent par des URL que le bundler Supabase refuse, et
// nodemailer traîne des dépendances Node lourdes pour un besoin d'une centaine de lignes.
// Couvre ce dont on a besoin : AUTH LOGIN, un destinataire ou plusieurs, une pièce jointe.

export type Mail = {
  fromName: string
  fromEmail: string
  to: string[]
  cc?: string[]
  replyTo?: string
  subject: string
  text: string
  attachments?: Array<{ filename: string; contentType: string; base64: string }>
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64(s: string): string {
  return btoa(String.fromCharCode(...enc.encode(s)))
}

/** En-tête non-ASCII encodé RFC 2047 ; laissé tel quel s'il est purement ASCII. */
export function encodeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ').trim()
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7E]*$/.test(clean) ? clean : `=?UTF-8?B?${b64(clean)}?=`
}

/** Adresse complète : "Nom <mail>" avec le nom encodé si besoin. */
export function formatAddress(name: string, email: string): string {
  const e = email.trim()
  if (!name.trim()) return e
  return `${encodeHeader(name)} <${e}>`
}

const chunk76 = (s: string): string => (s.match(/.{1,76}/g) ?? []).join('\r\n')

/** Une ligne commençant par un point doit être doublée (RFC 5321 §4.5.2). */
export const dotStuff = (body: string): string => body.replace(/^\./gm, '..')

export function buildMime(mail: Mail, now = new Date()): string {
  const boundary = `bcf_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const headers = [
    `From: ${formatAddress(mail.fromName, mail.fromEmail)}`,
    `To: ${mail.to.join(', ')}`,
  ]
  if (mail.cc?.length) headers.push(`Cc: ${mail.cc.join(', ')}`)
  if (mail.replyTo) headers.push(`Reply-To: ${mail.replyTo}`)
  headers.push(
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${boundary}@${mail.fromEmail.split('@')[1] ?? 'localhost'}>`,
    'MIME-Version: 1.0',
  )

  const atts = mail.attachments ?? []
  if (!atts.length) {
    headers.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '')
    return `${headers.join('\r\n')}\r\n${chunk76(b64(mail.text))}`
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '')
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunk76(b64(mail.text)),
  ]
  for (const a of atts) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      chunk76(a.base64),
    )
  }
  parts.push(`--${boundary}--`, '')
  return `${headers.join('\r\n')}\r\n${parts.join('\r\n')}`
}

// --- Dialogue SMTP --------------------------------------------------------------------------

type Conn = {
  read(p: Uint8Array): Promise<number | null>
  write(p: Uint8Array): Promise<number>
  close(): void
}

class SmtpError extends Error {
  constructor(public step: string, public reply: string) {
    // Le mot de passe ne transite jamais dans le message : seul le code serveur est repris.
    super(`SMTP ${step} : ${reply.slice(0, 200)}`)
    this.name = 'SmtpError'
  }
}

async function readReply(conn: Conn, buf: Uint8Array): Promise<string> {
  let out = ''
  // Une réponse SMTP peut tenir sur plusieurs lignes : la dernière est "NNN <espace>".
  while (true) {
    const n = await conn.read(buf)
    if (n == null) break
    out += dec.decode(buf.subarray(0, n))
    const lines = out.trimEnd().split('\r\n')
    const last = lines[lines.length - 1] ?? ''
    if (/^\d{3} /.test(last)) break
  }
  return out.trim()
}

async function send(conn: Conn, buf: Uint8Array, step: string, cmd: string, expect: string): Promise<string> {
  if (cmd) await conn.write(enc.encode(`${cmd}\r\n`))
  const reply = await readReply(conn, buf)
  if (!reply.startsWith(expect)) throw new SmtpError(step, reply)
  return reply
}

export type SmtpConfig = {
  hostname: string
  port: number
  username: string
  password: string
  timeoutMs?: number
}

/** Ouvre une session TLS, authentifie, envoie le message, ferme. Lève SmtpError si refusé. */
export async function sendMail(cfg: SmtpConfig, mail: Mail): Promise<void> {
  const rcpts = [...mail.to, ...(mail.cc ?? [])]
  if (!rcpts.length) throw new Error('aucun destinataire')

  const conn = (await Deno.connectTls({ hostname: cfg.hostname, port: cfg.port })) as unknown as Conn
  const buf = new Uint8Array(4096)
  const timeout = setTimeout(() => {
    try {
      conn.close()
    } catch {
      /* déjà fermée */
    }
  }, cfg.timeoutMs ?? 30_000)

  try {
    await send(conn, buf, 'accueil', '', '220')
    await send(conn, buf, 'EHLO', `EHLO ${cfg.hostname}`, '250')
    await send(conn, buf, 'AUTH', 'AUTH LOGIN', '334')
    await send(conn, buf, 'identifiant', b64(cfg.username), '334')
    await send(conn, buf, 'authentification', b64(cfg.password), '235')
    await send(conn, buf, 'expéditeur', `MAIL FROM:<${mail.fromEmail}>`, '250')
    for (const r of rcpts) await send(conn, buf, `destinataire ${r}`, `RCPT TO:<${r}>`, '250')
    await send(conn, buf, 'DATA', 'DATA', '354')
    await conn.write(enc.encode(`${dotStuff(buildMime(mail))}\r\n.\r\n`))
    const reply = await readReply(conn, buf)
    if (!reply.startsWith('250')) throw new SmtpError('envoi', reply)
    try {
      await conn.write(enc.encode('QUIT\r\n'))
    } catch {
      /* le serveur peut couper avant : le message est accepté, ça suffit */
    }
  } finally {
    clearTimeout(timeout)
    try {
      conn.close()
    } catch {
      /* déjà fermée */
    }
  }
}
