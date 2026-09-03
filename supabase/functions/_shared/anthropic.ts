// Appel Anthropic Messages partagé entre edge functions : timeout, retry sur 429/5xx/overloaded.
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
  usage?: { input_tokens?: number; output_tokens?: number }
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
