import { useMemo, useState } from 'react'
import { useGenerateIdeas, useMarkSuggestion, useSuggestions } from '../lib/assistant'
import { useEntries } from '../lib/entries'
import { logEvent } from '../lib/events'
import { Highlight } from '../lib/highlight'
import { PLATFORM_LABEL, STATUS_LABEL } from '../lib/labels'
import type { AssistantSuggestion } from '../lib/supabase'
import { ChevronDownIcon } from './icons'
import Skeleton from './Skeleton'

// Une idée générée par l'assistant est stockée en "titre — détail" : on affiche
// le titre seul, et le détail (angle, pourquoi) ne s'ouvre qu'au clic — pour
// juger d'un coup d'œil si l'idée intéresse avant de lire tout le raisonnement.
function splitIdea(s: AssistantSuggestion): { title: string; detail: string | null } {
  if (s.type !== 'idee_contenu') return { title: s.message, detail: null }
  const i = s.message.indexOf(' — ')
  return i === -1
    ? { title: s.message, detail: null }
    : { title: s.message.slice(0, i), detail: s.message.slice(i + 3) }
}

function SuggestionBody({ s }: { s: AssistantSuggestion }) {
  const { title, detail } = splitIdea(s)
  const [open, setOpen] = useState(false)
  if (!detail) return <div>{<Highlight text={title} />}</div>
  return (
    <div>
      <button
        type="button"
        className={`idea-toggle${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ flex: 1 }}>{<Highlight text={title} />}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <p className="idea-detail">
          <Highlight text={detail} />
        </p>
      )}
    </div>
  )
}

// ponytail: "vu" est local (pas de colonne reminder_dismissed_at en V1).
// Ajouter la persistance quand ça devient gênant.
export default function Today() {
  const { data: entries = [], isLoading } = useEntries()
  const { data: suggestions = [] } = useSuggestions()
  const markSuggestion = useMarkSuggestion()
  const generate = useGenerateIdeas()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // suggestions marquées "OK" pendant la session : restent visibles (grisées)
  // avec un bouton Rétablir, disparaissent au prochain chargement.
  const [done, setDone] = useState<Record<string, AssistantSuggestion>>({})

  function markDone(s: AssistantSuggestion) {
    logEvent('suggestion_done')
    setDone((d) => ({ ...d, [s.id]: s }))
    markSuggestion.mutate({ id: s.id, statut: 'traite' })
  }

  function restore(s: AssistantSuggestion) {
    setDone((d) => {
      const rest = { ...d }
      delete rest[s.id]
      return rest
    })
    markSuggestion.mutate({ id: s.id, statut: 'nouveau' })
  }

  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)

  const due = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.status !== 'publie' &&
          e.reminder_at != null &&
          new Date(e.reminder_at).getTime() <= now &&
          !dismissed.has(e.id),
      ),
    [entries, now, dismissed],
  )

  const todayItems = useMemo(
    () => entries.filter((e) => e.date === today && e.status !== 'publie'),
    [entries, today],
  )

  if (isLoading) return <Skeleton rows={4} />

  return (
    <>
      {due.length > 0 && (
        <div className="banner">
          <strong>Rappels</strong>
          {due.map((e) => (
            <div className="row" key={e.id} style={{ marginTop: 8 }}>
              <span>{e.title}</span>
              <span className="muted">· {STATUS_LABEL[e.status]}</span>
              <div className="spacer" />
              <button className="link" onClick={() => setDismissed((s) => new Set(s).add(e.id))}>
                Vu
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <h2 style={{ margin: 0 }}>L'assistant te propose</h2>
        <div className="spacer" />
        <button
          className="link"
          onClick={() => {
            logEvent('generate_ideas')
            generate.mutate()
          }}
          disabled={generate.isPending}
        >
          {generate.isPending ? 'Génération…' : 'Générer des idées'}
        </button>
      </div>
      {generate.error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {(generate.error as Error).message}
        </p>
      )}
      {suggestions.length === 0 && Object.keys(done).length === 0 && !generate.isPending && (
        <p className="empty">Rien pour l'instant. « Générer des idées » pour démarrer.</p>
      )}
      {suggestions.map((s) => (
        <div className="card" key={s.id}>
          <SuggestionBody s={s} />
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">
              {s.type === 'idee_contenu'
                ? 'Idée ajoutée au planning'
                : s.type === 'relance_boutique'
                  ? 'Relance boutique'
                  : 'Observation'}
            </span>
            <div className="spacer" />
            <button className="link" onClick={() => markDone(s)}>
              OK
            </button>
          </div>
        </div>
      ))}
      {Object.values(done)
        .filter((s) => !suggestions.some((q) => q.id === s.id))
        .map((s) => (
          <div className="card" key={s.id} style={{ opacity: 0.55 }}>
            <SuggestionBody s={s} />
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">✓ Traité</span>
              <div className="spacer" />
              <button className="link" onClick={() => restore(s)}>
                Rétablir
              </button>
            </div>
          </div>
        ))}

      <h2>À publier aujourd'hui</h2>
      {todayItems.length === 0 && <p className="empty">Rien de planifié pour aujourd'hui.</p>}
      {todayItems.map((e) => (
        <div className="card" key={e.id}>
          <div className="row">
            <strong>{e.title}</strong>
            <div className="spacer" />
            <span className="badge">{STATUS_LABEL[e.status]}</span>
          </div>
          {e.platform && <span className="muted">{PLATFORM_LABEL[e.platform]}</span>}
        </div>
      ))}
    </>
  )
}
