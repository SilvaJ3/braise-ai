import { useState, type FormEvent } from 'react'
import { ymd } from '../lib/dates'
import type { MarcheDraft } from '../lib/supabase'

export default function MarcheForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (draft: MarcheDraft) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [nom, setNom] = useState('')
  const [lieu, setLieu] = useState('')
  const [date, setDate] = useState(ymd())
  const [notes, setNotes] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ nom: nom.trim(), lieu: lieu.trim(), date_marche: date, notes: notes.trim() || null })
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <label htmlFor="marche-nom">Nom du marché</label>
      <input
        id="marche-nom"
        value={nom}
        placeholder="Marché de Noël"
        onChange={(e) => setNom(e.target.value)}
        required
        autoFocus
      />

      <label htmlFor="marche-lieu">Lieu</label>
      <input
        id="marche-lieu"
        value={lieu}
        placeholder="Place Saint-Lambert, Liège"
        onChange={(e) => setLieu(e.target.value)}
        required
      />

      <label htmlFor="marche-date">Date</label>
      <input id="marche-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

      <label htmlFor="marche-notes">Notes (optionnel)</label>
      <textarea id="marche-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="row" style={{ marginTop: 16 }}>
        <button className="primary" type="submit" disabled={busy || !nom.trim() || !lieu.trim()}>
          Créer le marché
        </button>
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}
