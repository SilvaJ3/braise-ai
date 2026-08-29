import { useMutation } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { askAssistant, type ChatMsg } from '../lib/assistant'

// ponytail: historique en mémoire seulement (perdu au reload). Les idées gardées
// deviennent des content_entries, qui eux persistent.
export default function Assistant() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const send = useMutation({
    mutationFn: (next: ChatMsg[]) => askAssistant(next),
    onSuccess: (reply) => {
      setMsgs((m) => [...m, { role: 'assistant', content: reply }])
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }))
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || send.isPending) return
    const next = [...msgs, { role: 'user' as const, content: text }]
    setMsgs(next)
    setInput('')
    send.mutate(next)
  }

  return (
    <>
      <h1>Assistant</h1>
      <p className="muted">
        Demande des idées de contenu, un angle pour une bougie, un plan de semaine…
      </p>

      {msgs.length === 0 && (
        <div className="card muted">
          Ex : « 3 idées de reels pour la collection d'automne » ou « aide-moi à
          relancer Facebook ».
        </div>
      )}

      {msgs.map((m, i) => (
        <div
          key={i}
          className="card"
          style={{
            background: m.role === 'user' ? 'var(--bg)' : 'var(--card)',
            whiteSpace: 'pre-wrap',
          }}
        >
          <span className="muted" style={{ fontSize: '0.75rem' }}>
            {m.role === 'user' ? 'Toi' : 'Assistant'}
          </span>
          <div style={{ marginTop: 4 }}>{m.content}</div>
        </div>
      ))}

      {send.isPending && <p className="muted">L'assistant réfléchit…</p>}
      {send.error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          Erreur : {(send.error as Error).message}
        </p>
      )}
      <div ref={endRef} />

      <form className="row" onSubmit={submit} style={{ marginTop: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écris ici…"
          style={{ flex: 1 }}
        />
        <button className="primary" type="submit" disabled={send.isPending || !input.trim()}>
          Envoyer
        </button>
      </form>
    </>
  )
}
