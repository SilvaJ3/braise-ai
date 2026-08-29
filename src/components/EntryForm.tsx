import { useState, type FormEvent } from 'react'
import type { ContentEntry, ContentEntryDraft } from '../lib/supabase'

const EMPTY: ContentEntryDraft = {
  title: '',
  product: null,
  type: null,
  platform: null,
  date: null,
  notes: null,
  status: 'idee',
  reminder_at: null,
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
    onSubmit({ ...d, title: d.title.trim() })
  }

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

      <label htmlFor="date">Date de publication (vide = simple idée)</label>
      <input
        id="date"
        type="date"
        value={d.date ?? ''}
        onChange={(e) => set('date', e.target.value || null)}
      />

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

      <label htmlFor="reminder">Rappel (optionnel)</label>
      <input
        id="reminder"
        type="datetime-local"
        value={toLocalInput(d.reminder_at)}
        onChange={(e) =>
          set('reminder_at', e.target.value ? new Date(e.target.value).toISOString() : null)
        }
      />

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
