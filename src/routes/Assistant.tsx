import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Reglages from '../components/Reglages'
import { SparkleIcon } from '../components/icons'
import { askAssistant, type ChatMsg } from '../lib/assistant'
import { logEvent } from '../lib/events'

// ponytail: historique en mémoire seulement (perdu au reload). Les idées gardées
// deviennent des content_entries, qui eux persistent.
export default function Assistant() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'chat' | 'reglages'>('chat')
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [added, setAdded] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const send = useMutation({
    mutationFn: (next: ChatMsg[]) => askAssistant(next),
    onSuccess: ({ reply, added }) => {
      setMsgs((m) => [...m, { role: 'assistant', content: reply }])
      if (added > 0) {
        setAdded((n) => n + added)
        qc.invalidateQueries({ queryKey: ['content_entries'] })
      }
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || send.isPending) return
    const next = [...msgs, { role: 'user' as const, content: text }]
    setMsgs(next)
    setInput('')
    logEvent('chat_message')
    send.mutate(next)
  }

  return (
    <>
      <h1>Assistant</h1>

      <div className="subnav">
        <a className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
          Discussion
        </a>
        <a className={tab === 'reglages' ? 'active' : ''} onClick={() => setTab('reglages')}>
          Ce qu'il sait
        </a>
      </div>

      {tab === 'reglages' && <Reglages />}

      {tab === 'chat' && (
        <>
      {msgs.length === 0 && (
        <div className="empty">
          <SparkleIcon size={28} />
          <p>
            Demande des idées de contenu, un angle pour une bougie, un plan de
            semaine. Dis-lui « ajoute ça au planning » quand une idée te plaît.
          </p>
        </div>
      )}

      {msgs.map((m, i) => (
        <div
          key={i}
          className="card"
          style={{
            background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--card)',
            whiteSpace: 'pre-wrap',
          }}
        >
          <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
            {m.role === 'user' ? 'Toi' : 'Assistant'}
          </span>
          <div style={{ marginTop: 4 }}>{m.content}</div>
        </div>
      ))}

      {added > 0 && <p className="muted">✨ {added} idée(s) ajoutée(s) au planning.</p>}
      {send.isPending && <p className="muted">L'assistant réfléchit…</p>}
      {send.error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          Erreur : {(send.error as Error).message}
        </p>
      )}
      <div ref={endRef} />

      <form className="row chat-input" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écris ici…"
          style={{ flex: 1 }}
          enterKeyHint="send"
        />
        <button className="primary" type="submit" disabled={send.isPending || !input.trim()}>
          Envoyer
        </button>
      </form>
        </>
      )}
    </>
  )
}
