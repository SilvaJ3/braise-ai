import { describe, expect, it } from 'vitest'
import { authorizeUrl, isTokenExpiringSoon } from './instagram'

const cfg = {
  appId: '123',
  appSecret: 'secret',
  redirectUri: 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/instagram-oauth',
}

describe('authorizeUrl', () => {
  it('inclut client_id, redirect_uri, scope et state', () => {
    const url = new URL(authorizeUrl(cfg, 'state-abc'))
    expect(url.hostname).toBe('www.instagram.com')
    expect(url.searchParams.get('client_id')).toBe('123')
    expect(url.searchParams.get('redirect_uri')).toBe(cfg.redirectUri)
    expect(url.searchParams.get('state')).toBe('state-abc')
    expect(url.searchParams.get('scope')).toContain('instagram_business_content_publish')
  })
})

describe('isTokenExpiringSoon', () => {
  const now = new Date('2026-09-10T00:00:00Z')

  it('true si expire dans moins de la marge', () => {
    expect(isTokenExpiringSoon('2026-09-15T00:00:00Z', 10, now)).toBe(true)
  })
  it('false si expire au-delà de la marge', () => {
    expect(isTokenExpiringSoon('2026-10-15T00:00:00Z', 10, now)).toBe(false)
  })
  it('true si déjà expiré', () => {
    expect(isTokenExpiringSoon('2026-09-01T00:00:00Z', 10, now)).toBe(true)
  })
})
