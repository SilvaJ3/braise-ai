import { useState, type FormEvent } from 'react'
import { useBoutiqueContacts, useDeleteContact, useLogContact } from '../lib/boutiques'
import { CANAL_LABEL } from '../lib/labels'
import type { Boutique, CanalContact } from '../lib/supabase'

const CANAUX: CanalContact[] = ['email', 'telephone', 'instagram', 'visite', 'autre']

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-BE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function todayYmd() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function BoutiqueDetail({ boutique }: { boutique: Boutique }) {
  const { data: contacts = [], isLoading } = useBoutiqueContacts(boutique.id)
  const logContact = useLogContact()
  const delContact = useDeleteContact()

  const [date, setDate] = useState(todayYmd())
  const [canal, setCanal] = useState<CanalContact | ''>('')
  const [resume, setResume] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    logContact.mutate(
      {
        boutique_id: boutique.id,
        date,
        canal: canal || null,
        resume: resume.trim() || null,
      },
      { onSuccess: () => setResume('') },
    )
  }

  return (
    <div className="card stack">
      <strong>Log de contact</strong>

      <form onSubmit={submit} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ flex: '1 1 130px' }}
        />
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value as CanalContact | '')}
          style={{ flex: '1 1 130px' }}
        >
          <option value="">Canal —</option>
          {CANAUX.map((c) => (
            <option key={c} value={c}>
              {CANAL_LABEL[c]}
            </option>
          ))}
        </select>
        <input
          placeholder="Résumé du contact"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          style={{ flex: '1 1 100%' }}
        />
        <button className="primary" type="submit" disabled={logContact.isPending}>
          Ajouter
        </button>
      </form>

      {isLoading && <p className="muted">Chargement…</p>}
      {!isLoading && contacts.length === 0 && (
        <p className="empty">Aucun contact enregistré.</p>
      )}
      {contacts.map((c) => (
        <div className="row" key={c.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <div>
            <strong>{fmtDate(c.date)}</strong>
            {c.canal && <span className="muted"> · {CANAL_LABEL[c.canal]}</span>}
            {c.resume && <p style={{ margin: '4px 0 0' }}>{c.resume}</p>}
          </div>
          <div className="spacer" />
          <button
            className="link"
            onClick={() => delContact.mutate({ id: c.id, boutiqueId: boutique.id })}
          >
            Supprimer
          </button>
        </div>
      ))}
    </div>
  )
}
