import { useMemo, useState } from 'react'
import EntryForm from '../components/EntryForm'
import { useCreateEntry, useDeleteEntry, useEntries, useUpdateEntry } from '../lib/entries'
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
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-BE', {
    day: '2-digit',
    month: 'short',
  })
}

export default function Planning() {
  const { data: entries = [], isLoading, error } = useEntries()
  const create = useCreateEntry()
  const update = useUpdateEntry()
  const del = useDeleteEntry()

  const [filter, setFilter] = useState<Filter>('tous')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ContentEntry | null>(null)

  const shown = useMemo(() => {
    return entries.filter((e) => {
      if (filter === 'tous') return true
      if (filter === 'idees') return e.date == null
      return e.status === filter
    })
  }, [entries, filter])

  if (isLoading) return <p className="muted">Chargement…</p>
  if (error) return <p className="muted">Erreur : {(error as Error).message}</p>

  return (
    <>
      <div className="row">
        <h1>Planning</h1>
        <div className="spacer" />
        {!creating && !editing && (
          <button className="primary" onClick={() => setCreating(true)}>
            + Nouveau
          </button>
        )}
      </div>

      {creating && (
        <EntryForm
          busy={create.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) =>
            create.mutate(draft, { onSuccess: () => setCreating(false) })
          }
        />
      )}

      {editing && (
        <EntryForm
          initial={editing}
          busy={update.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(patch) =>
            update.mutate(
              { id: editing.id, patch },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}

      <div className="nav" style={{ flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <a
            key={f.key}
            className={filter === f.key ? 'active' : ''}
            onClick={() => setFilter(f.key)}
            style={{ cursor: 'pointer' }}
          >
            {f.label}
          </a>
        ))}
      </div>

      {shown.length === 0 && <p className="muted">Rien ici.</p>}

      {shown.map((e) => (
        <div className="card" key={e.id}>
          <div className="row">
            <strong>{e.title}</strong>
            <div className="spacer" />
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
  )
}
