// Envoi des mails par le service de l'application (Resend, API HTTP).
//
// Choix : l'expéditeur est une adresse fixe et unique pour toute l'app, `no-reply@braaise.io`
// — pas celle de l'artisane, aucun réglage technique ne lui est demandé, et un nouveau
// compte peut envoyer immédiatement. Son nom commercial reste affiché comme expéditeur
// (« Au Coin du Feu <no-reply@braaise.io> »), et `Reply-To` renvoie vers sa propre adresse
// pour que les réponses des boutiques arrivent bien chez elle.
//
// API HTTP plutôt que SMTP : pas de port sortant à ouvrir, erreurs explicites, et le même
// code marche quel que soit l'hébergeur.

export type Piece = { filename: string; base64: string }

export type Mail = {
  /** Nom affiché de l'expéditeur (le nom commercial de l'utilisateur). */
  fromName: string
  /** Adresse à laquelle les destinataires répondent. */
  replyTo?: string
  to: string[]
  cc?: string[]
  subject: string
  text: string
  attachments?: Piece[]
}

export type MailerConfig = {
  apiKey: string
  /** Domaine vérifié chez Resend, ex. « braaise.io ». */
  domain: string
  timeoutMs?: number
}

/**
 * Domaine bac à sable de Resend : utilisable sans rien acheter, mais il n'accepte que
 * l'adresse `onboarding@` et ne peut écrire qu'au titulaire du compte Resend. Permet de
 * valider toute la chaîne (PDF, pièce jointe, mise en forme) avant d'acheter le domaine.
 */
export const DOMAINE_TEST = 'resend.dev'

export const estModeTest = (domaine: string): boolean => domaine === DOMAINE_TEST

/** Alias fixe pour tous les comptes, hors mode test (voir DOMAINE_TEST). */
export const ALIAS_NO_REPLY = 'no-reply'

export class MailError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'MailError'
    this.status = status
  }
}

/** Nettoie un nom affiché : pas de guillemets ni de saut de ligne (injection d'en-tête). */
export function nomAffichable(nom: string): string {
  return nom.replace(/[\r\n"<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

/** "Au Coin du Feu" + "aucoindufeu" + "braaise.io" → `Au Coin du Feu <aucoindufeu@braaise.io>` */
export function adresseExpediteur(nom: string, alias: string, domaine: string): string {
  const a = `${alias}@${domaine}`
  const n = nomAffichable(nom)
  return n ? `${n} <${a}>` : a
}

export async function envoyerMail(cfg: MailerConfig, mail: Mail): Promise<{ id: string }> {
  if (!mail.to.length && !mail.cc?.length) throw new MailError('aucun destinataire')

  const alias = estModeTest(cfg.domain) ? 'onboarding' : ALIAS_NO_REPLY
  const body = {
    from: adresseExpediteur(mail.fromName, alias, cfg.domain),
    to: mail.to,
    ...(mail.cc?.length ? { cc: mail.cc } : {}),
    ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    subject: mail.subject,
    text: mail.text,
    ...(mail.attachments?.length
      ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: a.base64 })) }
      : {}),
  }

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
    })
  } catch (e) {
    throw new MailError(`service de mail injoignable (${String((e as Error).message ?? e).slice(0, 120)})`)
  }

  const texte = await res.text()
  if (!res.ok) {
    // Les messages de Resend sont explicites (domaine non vérifié, adresse invalide…) :
    // on les remonte tels quels pour que l'utilisateur sache quoi corriger.
    let detail = texte.slice(0, 300)
    try {
      const j = JSON.parse(texte)
      detail = String(j.message ?? j.error ?? detail).slice(0, 300)
    } catch {
      /* réponse non JSON : on garde le texte brut */
    }
    throw new MailError(detail, res.status)
  }

  try {
    return { id: String(JSON.parse(texte).id ?? '') }
  } catch {
    return { id: '' }
  }
}
