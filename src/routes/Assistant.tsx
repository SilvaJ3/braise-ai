import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Reglages from '../components/Reglages'
import { SparkleIcon } from '../components/icons'
import { MAX_MESSAGE_CHARS, isPendingActive, useChatMessages, useSendMessage } from '../lib/assistant'
import { logEvent } from '../lib/events'
import { Highlight } from '../lib/highlight'

// L'historique est persistant (table chat_messages). La réponse est générée en
// arrière-plan côté serveur : Alexandra peut fermer l'app, une notification push
// la prévient quand c'est prêt.
export default function Assistant() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'chat' | 'reglages'>('chat')
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const { data: messages = [] } = useChatMessages()
  const send = useSendMessage()

  const pending = messages.some((m) => isPendingActive(m))
  const handledRef = useRef<string | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Quand une réponse se termine et qu'elle a ajouté des idées, rafraîchir le planning.
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || last.status === 'pending') return
    if (handledRef.current === last.id) return
    handledRef.current = last.id
    if (last.meta?.added) qc.invalidateQueries({ queryKey: ['content_entries'] })
  }, [messages, qc])

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || send.isPending || pending) return
    setInput('')
    logEvent('chat_message')
    send.mutate(text)
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
          {messages.length === 0 && !send.isPending && (
            <div className="empty">
              <SparkleIcon size={28} />
              <p>
                Demande des idées de contenu, un angle pour une bougie, un plan de
                semaine. Dis-lui « ajoute ça au planning » quand une idée te plaît.
              </p>
              <p className="muted">
                Tu peux fermer l'app après ta question : l'assistant continue de
                chercher et t'envoie une notification quand la réponse est prête.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className="card"
              style={{
                background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--card)',
                whiteSpace: 'pre-wrap',
              }}
            >
              <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                {m.role === 'user' ? 'Toi' : 'Assistant'}
              </span>
              {m.status === 'pending' ? (
                <div className="muted" style={{ marginTop: 4 }}>
                  {isPendingActive(m)
                    ? "L'assistant réfléchit… tu peux fermer l'app, tu seras notifiée."
                    : "La réponse n'a pas abouti. Repose ta question."}
                </div>
              ) : (
                <div style={{ marginTop: 4, color: m.status === 'error' ? 'var(--accent)' : undefined }}>
                  <Highlight text={m.content} />
                </div>
              )}
              {m.role === 'assistant' && m.meta?.added ? (
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  ✨ {m.meta.added} idée(s) ajoutée(s) au planning.
                </p>
              ) : null}
            </div>
          ))}

          {send.isPending && <p className="muted">Envoi…</p>}
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
              placeholder={pending ? 'Réponse en cours…' : 'Écris ici…'}
              style={{ flex: 1 }}
              enterKeyHint="send"
              maxLength={MAX_MESSAGE_CHARS}
              disabled={pending}
            />
            <button
              className="primary"
              type="submit"
              disabled={send.isPending || pending || !input.trim()}
            >
              Envoyer
            </button>
          </form>
        </>
      )}
    </>
  )
}
