import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEntries } from '../lib/entries'
import { PLATFORM_LABEL, STATUS_LABEL } from '../lib/labels'

// ponytail: "vu" est local (pas de colonne reminder_dismissed_at en V1).
// Ajouter la persistance quand ça devient gênant.
export default function Home() {
  const { data: entries = [], isLoading } = useEntries()
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
      <h1>Aujourd'hui</h1>

      {due.length > 0 && (
        <div className="banner">
          <strong>Rappels</strong>
          {due.map((e) => (
            <div className="row" key={e.id} style={{ marginTop: 8 }}>
              <span>{e.title}</span>
              <span className="muted">· {STATUS_LABEL[e.status]}</span>
              <div className="spacer" />
              <button
                className="link"
                onClick={() => setDismissed((s) => new Set(s).add(e.id))}
              >
                Vu
              </button>
            </div>
          ))}
        </div>
      )}

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

      <p style={{ marginTop: 24 }}>
        <Link to="/planning">Voir tout le planning →</Link>
      </p>
    </>
  )
}
