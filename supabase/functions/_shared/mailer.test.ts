import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALIAS_NO_REPLY,
  adresseExpediteur,
  DOMAINE_TEST,
  envoyerMail,
  estModeTest,
  MailError,
  nomAffichable,
} from './mailer'

const cfg = { apiKey: 're_test', domain: 'braise.io' }
const mail = {
  fromName: 'Au Coin du Feu',
  replyTo: 'artisane@gmail.com',
  to: ['contact@laboutique.be'],
  subject: 'Bon de dépôt n° 2026-001',
  text: 'Bonjour',
}

afterEach(() => vi.unstubAllGlobals())

const stubFetch = (impl: (url: string, init: RequestInit) => Response) => {
  const spy = vi.fn((url: string, init: RequestInit) => Promise.resolve(impl(url, init)))
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('adresseExpediteur', () => {
  it('compose nom + adresse de l’app', () => {
    expect(adresseExpediteur('Au Coin du Feu', ALIAS_NO_REPLY, 'braise.io')).toBe(
      'Au Coin du Feu <no-reply@braise.io>',
    )
  })
  it('tombe sur l’adresse seule si le nom est vide', () => {
    expect(adresseExpediteur('  ', ALIAS_NO_REPLY, 'braise.io')).toBe('no-reply@braise.io')
  })
  it('neutralise une injection d’en-tête', () => {
    const a = adresseExpediteur('X\r\nBcc: pirate@example.com', ALIAS_NO_REPLY, 'braise.io')
    expect(a).not.toMatch(/[\r\n]/)
    expect(nomAffichable('a"b<c>d')).toBe('a b c d')
  })
})

describe('envoyerMail', () => {
  it('poste au bon endroit, avec en-têtes, expéditeur fixe et pièce jointe', async () => {
    const spy = stubFetch(() => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }))
    const r = await envoyerMail(cfg, {
      ...mail,
      cc: ['artisane@gmail.com'],
      attachments: [{ filename: 'bon.pdf', base64: 'QUJD' }],
    })
    expect(r.id).toBe('msg_1')
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
    const body = JSON.parse(init.body as string)
    expect(body.from).toBe('Au Coin du Feu <no-reply@braise.io>')
    expect(body.reply_to).toBe('artisane@gmail.com')
    expect(body.cc).toEqual(['artisane@gmail.com'])
    expect(body.attachments).toEqual([{ filename: 'bon.pdf', content: 'QUJD' }])
  })

  it('l’expéditeur ne dépend pas du compte : même adresse pour deux artisanes différentes', async () => {
    const spy = stubFetch(() => new Response('{"id":"x"}', { status: 200 }))
    await envoyerMail(cfg, { ...mail, fromName: 'Bougies du Nord' })
    const body = JSON.parse(spy.mock.calls[0][1].body as string)
    expect(body.from).toBe('Bougies du Nord <no-reply@braise.io>')
  })

  it('omet les champs vides plutôt que d’envoyer null', async () => {
    const spy = stubFetch(() => new Response('{"id":"x"}', { status: 200 }))
    await envoyerMail(cfg, { ...mail, replyTo: undefined })
    const body = JSON.parse(spy.mock.calls[0][1].body as string)
    expect('reply_to' in body).toBe(false)
    expect('cc' in body).toBe(false)
    expect('attachments' in body).toBe(false)
  })

  it('remonte le message d’erreur du service', async () => {
    stubFetch(() => new Response(JSON.stringify({ message: 'The braise.io domain is not verified' }), { status: 403 }))
    await expect(envoyerMail(cfg, mail)).rejects.toThrow(/domain is not verified/)
  })

  it('signale un service injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))))
    await expect(envoyerMail(cfg, mail)).rejects.toThrow(/injoignable/)
  })

  it('refuse un envoi sans destinataire', async () => {
    await expect(envoyerMail(cfg, { ...mail, to: [] })).rejects.toBeInstanceOf(MailError)
  })

  it('bascule sur onboarding@ en mode test (avant achat du domaine)', async () => {
    const spy = stubFetch(() => new Response('{"id":"x"}', { status: 200 }))
    expect(estModeTest(DOMAINE_TEST)).toBe(true)
    expect(estModeTest('braise.io')).toBe(false)
    await envoyerMail({ apiKey: 're_test', domain: DOMAINE_TEST }, mail)
    const body = JSON.parse(spy.mock.calls[0][1].body as string)
    expect(body.from).toBe('Au Coin du Feu <onboarding@resend.dev>')
  })
})
