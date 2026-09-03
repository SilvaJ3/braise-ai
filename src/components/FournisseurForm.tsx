import { useState, type FormEvent } from 'react'
import type { Fournisseur, FournisseurDraft } from '../lib/supabase'

const EMPTY: FournisseurDraft = {
  nom: '',
  email: null,
  telephone: null,
  site_web: null,
  delai_livraison_jours: null,
  notes: null,
  actif: true,
}

export default function FournisseurForm({
  initial,
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  initial?: Fournisseur
  onSubmit: (draft: FournisseurDraft) => void
  onCancel: () => void
  busy?: boolean
  error?: string | null
}) {
  const [d, setD] = useState<FournisseurDraft>(
    initial
      ? {
          nom: initial.nom,
          email: initial.email,
          telephone: initial.telephone,
          site_web: initial.site_web,
          delai_livraison_jours: initial.delai_livraison_jours,
          notes: initial.notes,
          actif: initial.actif,
        }
      : EMPTY,
  )
  const set = <K extends keyof FournisseurDraft>(k: K, v: FournisseurDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const nom = d.nom.trim()
    if (!nom) return
    onSubmit({ ...d, nom })
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <label htmlFor="f-nom">Nom</label>
      <input id="f-nom" value={d.nom} onChange={(e) => set('nom', e.target.value)} required autoFocus maxLength={200} />

      <div className="row">
        <div className="field-half">
          <label htmlFor="f-email">Email</label>
          <input id="f-email" type="email" value={d.email ?? ''} onChange={(e) => set('email', e.target.value || null)} maxLength={200} />
        </div>
        <div className="field-half">
          <label htmlFor="f-tel">Téléphone</label>
          <input id="f-tel" value={d.telephone ?? ''} onChange={(e) => set('telephone', e.target.value || null)} maxLength={50} />
        </div>
      </div>

      <div className="row">
        <div className="field-half">
          <label htmlFor="f-web">Site web</label>
          <input id="f-web" value={d.site_web ?? ''} onChange={(e) => set('site_web', e.target.value || null)} maxLength={300} placeholder="https://…" />
        </div>
        <div className="field-half">
          <label htmlFor="f-delai">Délai livraison (jours)</label>
          <input
            id="f-delai"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            value={d.delai_livraison_jours ?? ''}
            onChange={(e) => set('delai_livraison_jours', e.target.value ? Math.max(0, Math.min(365, Math.round(Number(e.target.value)))) : null)}
          />
        </div>
      </div>

      <label htmlFor="f-notes">Notes</label>
      <textarea id="f-notes" value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} maxLength={4000} placeholder="Minimum de commande, conditions, contact…" />

      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={d.actif} onChange={(e) => set('actif', e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
        Fournisseur actif
      </label>

      {error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {error}
        </p>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" type="submit" disabled={busy || !d.nom.trim()}>
          Enregistrer
        </button>
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}
