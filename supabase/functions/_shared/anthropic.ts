// Appel Anthropic Messages partagé entre edge functions : timeout, retry sur 429/5xx/overloaded.
import type { UsageBrut } from './compte.ts'

export type AnthropicBlock = {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}
export type AnthropicResp = {
  content: AnthropicBlock[]
  stop_reason: string
  usage?: UsageBrut
}

/**
 * Un bloc de `system`. Les appels au modèle doivent ordonner ces blocs du plus stable au plus
 * variable, et marquer le point de cache sur le dernier bloc stable : le cache d'Anthropic porte
 * sur le **préfixe** exact, donc tout ce qui bouge souvent doit venir après la marque, sinon
 * chaque appel écrit un cache qu'aucun appel suivant ne relira (et paie la majoration d'écriture
 * de 25 % pour rien).
 */
export type SystemBlock = {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

/**
 * Assemble un `system` en blocs : `stable` d'abord (consignes, contexte qui change rarement,
 * marqué pour le cache), `variable` ensuite (planning, stock, dates — jamais mis en cache).
 * Les blocs vides sont écartés : un bloc vide ferait échouer la comparaison de préfixe pour rien.
 */
export function systemEnBlocs(stable: string[], variable: string[] = []): SystemBlock[] {
  const stables = stable.filter((t) => t.trim())
  const blocs: SystemBlock[] = stables.map((text, i) => ({
    type: 'text' as const,
    text,
    ...(i === stables.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }))
  for (const text of variable) {
    if (text.trim()) blocs.push({ type: 'text', text })
  }
  return blocs
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529])
const RETRYABLE_MSG = /Anthropic (408|409|425|429|5\d\d)/

export async function anthropicMessages(
  apiKey: string,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<AnthropicResp> {
  const timeoutMs = opts.timeoutMs ?? 90_000
  const retries = opts.retries ?? 2
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return (await res.json()) as AnthropicResp
      const text = await res.text()
      lastErr = new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`)
      if (!RETRYABLE.has(res.status)) throw lastErr
    } catch (e) {
      lastErr = e
      const name = (e as { name?: string })?.name
      // erreurs réseau / timeout : on réessaie ; erreur applicative non retryable : on sort
      if (!(name === 'TimeoutError' || name === 'AbortError' || name === 'TypeError' || RETRYABLE_MSG.test(String(e)))) {
        throw e
      }
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export const textOf = (content: AnthropicBlock[]): string =>
  content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')

export const toolInputOf = (content: AnthropicBlock[], name: string): unknown =>
  content.find((b) => b.type === 'tool_use' && b.name === name)?.input
