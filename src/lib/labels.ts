import type { CanalContact, ContentStatus } from './supabase'

export const STATUS_LABEL: Record<ContentStatus, string> = {
  idee: 'Idée',
  a_faire: 'À faire',
  planifie: 'Planifié',
  publie: 'Publié',
}

export const STATUS_ORDER: ContentStatus[] = ['idee', 'a_faire', 'planifie', 'publie']

export const TYPE_LABEL: Record<string, string> = {
  post: 'Post',
  story: 'Story',
  reel: 'Reel',
}

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
}

export const PERF_LABEL: Record<'carton' | 'ok' | 'bof', string> = {
  carton: '🔥 Carton',
  ok: '👍 OK',
  bof: '😐 Bof',
}

export const CANAL_LABEL: Record<CanalContact, string> = {
  email: 'Email',
  telephone: 'Téléphone',
  instagram: 'Instagram',
  visite: 'Visite',
  autre: 'Autre',
}

export function nextStatus(s: ContentStatus): ContentStatus {
  const i = STATUS_ORDER.indexOf(s)
  return STATUS_ORDER[Math.min(i + 1, STATUS_ORDER.length - 1)]
}
