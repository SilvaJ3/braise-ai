import { useState, type FormEvent } from 'react'
import { geocodeAdresse } from '../lib/geocode'
import { CANAL_LABEL } from '../lib/labels'
import type { Boutique, BoutiqueDraft, CanalContact } from '../lib/supabase'

const EMPTY: BoutiqueDraft = {
  nom: '',
  adresse: null,
  horaires: null,
  canal_prefere: null,
  email: null,
  telephone: null,
  notes: null,
  actif: true,
  lat: null,
  lng: null,
}

const CANAUX: CanalContact[] = ['email', 'telephone', 'instagram', 'visite', 'autre']

export default function BoutiqueForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: Boutique
  onSubmit: (draft: BoutiqueDraft) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [d, setD] = useState<BoutiqueDraft>(
    initial
      ? {
          nom: initial.nom,
          adresse: initial.adresse,
          horaires: initial.horaires,
          canal_prefere: initial.canal_prefere,
          email: initial.email,
          telephone: initial.telephone,
          notes: initial.notes,
          actif: initial.actif,
          lat: initial.lat,
          lng: initial.lng,
        }
      : EMPTY,
  )
  const [horairesText, setHorairesText] = useState(
    initial?.horaires?.note ?? '',
  )
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')

  function set<K extends keyof BoutiqueDraft>(k: K, v: BoutiqueDraft[K]) {
    setD((prev) => ({ ...prev, [k]: v }))
  }

  async function localiser() {
    if (!d.adresse?.trim()) return
    setGeoStatus('loading')
    const point = await geocodeAdresse(d.adresse.trim())
    if (!point) {
      setGeoStatus('error')
      return
    }
    set('lat', point.lat)
    set('lng', point.lng)
    setGeoStatus('ok')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      ...d,
      nom: d.nom.trim(),
      horaires: horairesText.trim() ? { note: horairesText.trim() } : null,
    })
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <label htmlFor="nom">Nom</label>
      <input
        id="nom"
        value={d.nom}
        onChange={(e) => set('nom', e.target.value)}
        required
        autoFocus
      />

      <label htmlFor="adresse">Adresse</label>
      <input
        id="adresse"
        value={d.adresse ?? ''}
        onChange={(e) => {
          set('adresse', e.target.value || null)
          setGeoStatus('idle')
        }}
      />
      <div className="row" style={{ marginTop: -6 }}>
        <button type="button" onClick={localiser} disabled={!d.adresse?.trim() || geoStatus === 'loading'}>
          {geoStatus === 'loading' ? 'Recherche…' : 'Localiser sur la carte'}
        </button>
        {geoStatus === 'ok' && <span className="muted">📍 Localisée</span>}
        {geoStatus === 'error' && (
          <span className="muted" style={{ color: 'var(--accent)' }}>
            Adresse introuvable
          </span>
        )}
        {geoStatus === 'idle' && d.lat != null && <span className="muted">📍 Déjà localisée</span>}
      </div>

      <label htmlFor="horaires">Horaires</label>
      <input
        id="horaires"
        placeholder="ex. lun-sam 10h-18h"
        value={horairesText}
        onChange={(e) => setHorairesText(e.target.value)}
      />

      <div className="row">
        <div className="field-half">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={d.email ?? ''}
            onChange={(e) => set('email', e.target.value || null)}
          />
        </div>
        <div className="field-half">
          <label htmlFor="telephone">Téléphone</label>
          <input
            id="telephone"
            value={d.telephone ?? ''}
            onChange={(e) => set('telephone', e.target.value || null)}
          />
        </div>
      </div>

      <label htmlFor="canal">Canal préféré</label>
      <select
        id="canal"
        value={d.canal_prefere ?? ''}
        onChange={(e) =>
          set('canal_prefere', (e.target.value || null) as BoutiqueDraft['canal_prefere'])
        }
      >
        <option value="">—</option>
        {CANAUX.map((c) => (
          <option key={c} value={c}>
            {CANAL_LABEL[c]}
          </option>
        ))}
      </select>

      <label htmlFor="notes">Notes</label>
      <textarea
        id="notes"
        value={d.notes ?? ''}
        onChange={(e) => set('notes', e.target.value || null)}
      />

      <label className="row" style={{ gap: 8 }}>
        <input
          type="checkbox"
          checked={d.actif}
          onChange={(e) => set('actif', e.target.checked)}
        />
        Boutique active
      </label>

      <div className="row" style={{ marginTop: 16 }}>
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
