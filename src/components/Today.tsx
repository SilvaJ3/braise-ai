import { useMemo, useState } from 'react'
import { useGenerateIdeas, useMarkSuggestion, useSuggestions } from '../lib/assistant'
import { useEntries } from '../lib/entries'
import { PLATFORM_LABEL, STATUS_LABEL } from '../lib/labels'

// ponytail: "vu" est local (pas de colonne reminder_dismissed_at en V1).
// Ajouter la persistance quand ça devient gênant.
export default function Today() {
  const { data: entries = [], isLoading } = useEntries()
  const { data: suggestions = [] } = useSuggestions()
  const markSuggestion = useMarkSuggestion()
  const generate = useGenerateIdeas()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

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

  if (isLoading) return <p className="muted">Chargement…</p>

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
          onClick={() => generate.mutate()}
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
      {suggestions.length === 0 && (
        <p className="muted">Rien pour l'instant. « Générer des idées » pour démarrer.</p>
      )}
      {suggestions.map((s) => (
        <div className="card" key={s.id}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{s.message}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">
              {s.type === 'idee_contenu' ? 'Idée ajoutée au planning' : 'Observation'}
            </span>
            <div className="spacer" />
            <button
              className="link"
              onClick={() => markSuggestion.mutate({ id: s.id, statut: 'traite' })}
            >
              OK
            </button>
          </div>
        </div>
      ))}

      <h2>À publier aujourd'hui</h2>
      {todayItems.length === 0 && <p className="muted">Rien de planifié pour aujourd'hui.</p>}
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
