import { useState, type FormEvent } from 'react'
import type { ContentEntry, ContentEntryDraft } from '../lib/supabase'

const EMPTY: ContentEntryDraft = {
  title: '',
  product: null,
  type: null,
  platform: null,
  date: null,
  scheduled_time: null,
  reminder_lead_hours: null,
  notes: null,
  status: 'idee',
  reminder_at: null,
}

const LEAD_OPTIONS: { h: number; label: string }[] = [
  { h: 0, label: "à l'heure de publication" },
  { h: 1, label: '1 h avant' },
  { h: 3, label: '3 h avant' },
  { h: 12, label: '12 h avant' },
  { h: 24, label: '24 h avant' },
  { h: 48, label: '48 h avant' },
]

// date "AAAA-MM-JJ" + heure "HH:MM" - X h  ->  ISO (heure locale)
function computeReminderAt(
  date: string | null,
  time: string | null,
  leadHours: number | null,
): string | null {
  if (!date || !time || leadHours == null) return null
  const at = new Date(`${date}T${time}`)
  if (Number.isNaN(at.getTime())) return null
  return new Date(at.getTime() - leadHours * 3_600_000).toISOString()
}

export default function EntryForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: ContentEntry
  onSubmit: (draft: ContentEntryDraft) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [d, setD] = useState<ContentEntryDraft>(
    initial
      ? {
          title: initial.title,
          product: initial.product,
          type: initial.type,
          platform: initial.platform,
          date: initial.date,
          scheduled_time: initial.scheduled_time
            ? initial.scheduled_time.slice(0, 5)
            : null,
          reminder_lead_hours: initial.reminder_lead_hours,
          notes: initial.notes,
          status: initial.status,
          reminder_at: initial.reminder_at,
        }
      : EMPTY,
  )

  function set<K extends keyof ContentEntryDraft>(k: K, v: ContentEntryDraft[K]) {
    setD((prev) => ({ ...prev, [k]: v }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      ...d,
      title: d.title.trim(),
      reminder_at: computeReminderAt(d.date, d.scheduled_time, d.reminder_lead_hours),
    })
  }

  const canRemind = !!d.date && !!d.scheduled_time

  return (
    <form className="card stack" onSubmit={submit}>
      <label htmlFor="title">Titre</label>
      <input
        id="title"
        value={d.title}
        onChange={(e) => set('title', e.target.value)}
        required
        autoFocus
      />

      <label htmlFor="product">Bougie / produit</label>
      <input
        id="product"
        value={d.product ?? ''}
        onChange={(e) => set('product', e.target.value || null)}
      />

      <div className="row">
        <div className="field-half">
          <label htmlFor="type">Type</label>
          <select
            id="type"
            value={d.type ?? ''}
            onChange={(e) => set('type', (e.target.value || null) as ContentEntryDraft['type'])}
          >
            <option value="">—</option>
            <option value="post">Post</option>
            <option value="story">Story</option>
            <option value="reel">Reel</option>
          </select>
        </div>
        <div className="field-half">
          <label htmlFor="platform">Plateforme</label>
          <select
            id="platform"
            value={d.platform ?? ''}
            onChange={(e) =>
              set('platform', (e.target.value || null) as ContentEntryDraft['platform'])
            }
          >
            <option value="">—</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field-half">
          <label htmlFor="date">Date (vide = simple idée)</label>
          <input
            id="date"
            type="date"
            value={d.date ?? ''}
            onChange={(e) => {
              const date = e.target.value || null
              set('date', date)
              if (!date) {
                set('scheduled_time', null)
                set('reminder_lead_hours', null)
              }
            }}
          />
        </div>
        <div className="field-half">
          <label htmlFor="time">Heure</label>
          <input
            id="time"
            type="time"
            value={d.scheduled_time ?? ''}
            disabled={!d.date}
            onChange={(e) => {
              const time = e.target.value || null
              set('scheduled_time', time)
              if (!time) set('reminder_lead_hours', null)
            }}
          />
        </div>
      </div>

      <label htmlFor="lead">Me le rappeler</label>
      <select
        id="lead"
        value={d.reminder_lead_hours ?? ''}
        disabled={!canRemind}
        onChange={(e) =>
          set('reminder_lead_hours', e.target.value ? Number(e.target.value) : null)
        }
      >
        <option value="">Pas de rappel</option>
        {LEAD_OPTIONS.map((o) => (
          <option key={o.h} value={o.h}>
            {o.label}
          </option>
        ))}
      </select>
      {!canRemind && (
        <p className="muted" style={{ marginTop: 4 }}>
          Renseigne une date et une heure pour activer le rappel.
        </p>
      )}

      <label htmlFor="status">Statut</label>
      <select
        id="status"
        value={d.status}
        onChange={(e) => set('status', e.target.value as ContentEntryDraft['status'])}
      >
        <option value="idee">Idée</option>
        <option value="a_faire">À faire</option>
        <option value="planifie">Planifié</option>
        <option value="publie">Publié</option>
      </select>

      <label htmlFor="notes">Notes</label>
      <textarea
        id="notes"
        value={d.notes ?? ''}
        onChange={(e) => set('notes', e.target.value || null)}
      />

      <div className="row" style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={busy || !d.title.trim()}>
          Enregistrer
        </button>
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}
