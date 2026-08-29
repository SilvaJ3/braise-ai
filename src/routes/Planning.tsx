import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import EntryForm from '../components/EntryForm'
import Fab from '../components/Fab'
import MonthCalendar from '../components/MonthCalendar'
import Skeleton from '../components/Skeleton'
import { GridIcon, ListIcon } from '../components/icons'
import { useCreateEntry, useDeleteEntry, useEntries, useUpdateEntry } from '../lib/entries'
import { logEvent } from '../lib/events'
import { PLATFORM_LABEL, STATUS_LABEL, TYPE_LABEL, nextStatus } from '../lib/labels'
import type { ContentEntry, ContentStatus } from '../lib/supabase'

type Filter = 'tous' | ContentStatus | 'idees'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'idees', label: 'Idées' },
  { key: 'a_faire', label: 'À faire' },
  { key: 'planifie', label: 'Planifié' },
  { key: 'publie', label: 'Publié' },
]

function fmtDate(d: string | null) {
  if (!d) return 'sans date'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-BE', { day: '2-digit', month: 'short' })
}

export default function Planning() {
  const location = useLocation()
  const { data: entries = [], isLoading, error } = useEntries()
  const create = useCreateEntry()
  const update = useUpdateEntry()
  const del = useDeleteEntry()

  const [view, setView] = useState<'calendrier' | 'liste'>('calendrier')
  const [filter, setFilter] = useState<Filter>('tous')
  const [day, setDay] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ContentEntry | null>(null)

  // FAB depuis "Aujourd'hui" : ouvre directement le formulaire
  useEffect(() => {
    if ((location.state as { new?: boolean } | null)?.new) {
      setCreating(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const shown = useMemo(() => {
    return entries.filter((e) => {
      if (day) return e.date === day
      if (filter === 'tous') return true
      if (filter === 'idees') return e.date == null
      return e.status === filter
    })
  }, [entries, filter, day])

  const openForm = creating || editing !== null

  return (
    <>
      <h1>Planning</h1>

      <div className="subnav">
        <a
          className={view === 'calendrier' ? 'active' : ''}
          onClick={() => setView('calendrier')}
        >
          <GridIcon />
          Calendrier
        </a>
        <a
          className={view === 'liste' ? 'active' : ''}
          onClick={() => {
            setView('liste')
            setDay(null)
          }}
        >
          <ListIcon />
          Liste
        </a>
      </div>

      {isLoading && <Skeleton rows={5} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {creating && (
        <EntryForm
          busy={create.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) =>
            create.mutate(draft, {
              onSuccess: () => {
                setCreating(false)
                logEvent('entry_created')
              },
            })
          }
        />
      )}

      {editing && (
        <EntryForm
          initial={editing}
          busy={update.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(patch) =>
            update.mutate({ id: editing.id, patch }, { onSuccess: () => setEditing(null) })
          }
        />
      )}

      {!isLoading && !error && (
        <>
          {view === 'calendrier' && (
            <MonthCalendar entries={entries} selected={day} onSelect={setDay} />
          )}

          {view === 'liste' && (
            <div className="subnav">
              {FILTERS.map((f) => (
                <a
                  key={f.key}
                  className={filter === f.key ? 'active' : ''}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </a>
              ))}
            </div>
          )}

          {day && (
            <div className="row" style={{ margin: '8px 0' }}>
              <strong>{fmtDate(day)}</strong>
              <button className="link" onClick={() => setDay(null)}>
                tout afficher
              </button>
            </div>
          )}

          {shown.length === 0 && <p className="empty">Rien ici pour l'instant.</p>}

          {shown.map((e) => (
            <div className="card" key={e.id}>
              <div className="row">
                <strong>{e.title}</strong>
                <div className="spacer" />
                {e.source === 'assistant' && (
                  <span className="badge" title="Suggestion de l'assistant">
                    ✨
                  </span>
                )}
                <span className="badge">{STATUS_LABEL[e.status]}</span>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <span className="muted">{fmtDate(e.date)}</span>
                {e.platform && <span className="muted">· {PLATFORM_LABEL[e.platform]}</span>}
                {e.type && <span className="muted">· {TYPE_LABEL[e.type]}</span>}
                {e.product && <span className="muted">· {e.product}</span>}
              </div>
              {e.notes && <p style={{ margin: '8px 0 0' }}>{e.notes}</p>}
              <div className="row" style={{ marginTop: 10 }}>
                {e.status !== 'publie' && (
                  <button
                    onClick={() =>
                      update.mutate({ id: e.id, patch: { status: nextStatus(e.status) } })
                    }
                  >
                    → {STATUS_LABEL[nextStatus(e.status)]}
                  </button>
                )}
                <button className="link" onClick={() => setEditing(e)}>
                  Modifier
                </button>
                <div className="spacer" />
                <button
                  className="link"
                  onClick={() => {
                    if (confirm(`Supprimer « ${e.title} » ?`)) del.mutate(e.id)
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!openForm && <Fab onClick={() => setCreating(true)} />}
    </>
  )
}
