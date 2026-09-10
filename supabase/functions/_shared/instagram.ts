// Instagram API with Instagram Login (flux 2024+, sans Page Facebook requise).
// Doc : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
//
// TypeScript pur, aucune dépendance Deno/DOM : testable en vitest comme le reste de _shared/.

export class InstagramError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'InstagramError'
    this.status = status
  }
}

export type InstagramConfig = {
  appId: string
  appSecret: string
  redirectUri: string
}

const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'].join(',')

/** URL vers laquelle rediriger l'utilisateur pour autoriser l'app. */
export function authorizeUrl(cfg: InstagramConfig, state: string): string {
  const p = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    scope: SCOPES,
    response_type: 'code',
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`
}

type TokenResponse = { access_token: string; user_id: number | string }
type LongLivedResponse = { access_token: string; token_type: string; expires_in: number }
type MeResponse = { id: string; username: string }
type CreationResponse = { id: string }
type ApiError = { error?: { message?: string } ; error_message?: string }

async function asJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & ApiError
  if (!res.ok) {
    const msg = body?.error?.message || body?.error_message || `Instagram API ${res.status}`
    throw new InstagramError(msg, res.status)
  }
  return body
}

/** Étape 1 : échange le code d'autorisation contre un token courte durée (~1 h). */
export async function exchangeCodeForToken(
  cfg: InstagramConfig,
  code: string,
): Promise<TokenResponse> {
  const form = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: cfg.redirectUri,
    code,
  })
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  return asJson<TokenResponse>(res)
}

/** Étape 2 : échange le token courte durée contre un token longue durée (~60 j). */
export async function exchangeForLongLivedToken(
  appSecret: string,
  shortLivedToken: string,
): Promise<LongLivedResponse> {
  const p = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret,
    access_token: shortLivedToken,
  })
  const res = await fetch(`https://graph.instagram.com/access_token?${p.toString()}`)
  return asJson<LongLivedResponse>(res)
}

/** Renouvelle un token longue durée avant son expiration (à appeler avant J-10). */
export async function refreshLongLivedToken(accessToken: string): Promise<LongLivedResponse> {
  const p = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken })
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${p.toString()}`)
  return asJson<LongLivedResponse>(res)
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  const p = new URLSearchParams({ fields: 'id,username', access_token: accessToken })
  const res = await fetch(`https://graph.instagram.com/me?${p.toString()}`)
  return asJson<MeResponse>(res)
}

/** true si le token expire dans moins de `marginDays` jours. */
export function isTokenExpiringSoon(expiresAt: string, marginDays = 10, now = new Date()): boolean {
  const marginMs = marginDays * 86_400_000
  return new Date(expiresAt).getTime() - now.getTime() < marginMs
}

/** Crée le conteneur média (image) puis le publie. Renvoie l'id du média publié. */
export async function publishImage(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const createRes = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      image_url: imageUrl,
      caption: caption.slice(0, 2200),
      access_token: accessToken,
    }),
  })
  const { id: creationId } = await asJson<CreationResponse>(createRes)

  const publishRes = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: creationId, access_token: accessToken }),
  })
  const { id: mediaId } = await asJson<CreationResponse>(publishRes)
  return mediaId
}
