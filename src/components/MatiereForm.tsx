import { useState, type FormEvent } from 'react'
import { CATEGORIE_LABEL, UNITE_LABEL } from '../lib/atelier'
import type { CategorieMatiere, Fournisseur, MatierePremiere, MatierePremiereDraft, Unite } from '../lib/supabase'

const EMPTY: MatierePremiereDraft = {
  nom: '',
  categorie: null,
  unite: 'g',
  stock_actuel: 0,
  seuil_alerte: null,
  prix_unitaire: null,
  fournisseur_id: null,
  reference_fournisseur: null,
  notes: null,
  actif: true,
}

const num = (v: string): number | null => {
  if (!v.trim()) return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export default function MatiereForm({
  initial,
  fournisseurs,
  onSubmit,
  onCancel,
  busy,
  error,
}: {
  initial?: MatierePremiere
  fournisseurs: Fournisseur[]
  onSubmit: (draft: MatierePremiereDraft) => void
  onCancel: () => void
  busy?: boolean
  error?: string | null
}) {
  const [d, setD] = useState<MatierePremiereDraft>(
    initial
      ? {
          nom: initial.nom,
          categorie: initial.categorie,
          unite: initial.unite,
          stock_actuel: initial.stock_actuel,
          seuil_alerte: initial.seuil_alerte,
          prix_unitaire: initial.prix_unitaire,
          fournisseur_id: initial.fournisseur_id,
          reference_fournisseur: initial.reference_fournisseur,
          notes: initial.notes,
          actif: initial.actif,
        }
      : EMPTY,
  )
  // champs numériques en texte le temps de la saisie (virgule, vide…)
  const [stockTxt, setStockTxt] = useState(String(d.stock_actuel))
  const [seuilTxt, setSeuilTxt] = useState(d.seuil_alerte == null ? '' : String(d.seuil_alerte))
  const [prixTxt, setPrixTxt] = useState(d.prix_unitaire == null ? '' : String(d.prix_unitaire))

  const set = <K extends keyof MatierePremiereDraft>(k: K, v: MatierePremiereDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const nom = d.nom.trim()
    if (!nom) return
    onSubmit({
      ...d,
      nom,
      stock_actuel: num(stockTxt) ?? 0,
      seuil_alerte: num(seuilTxt),
      prix_unitaire: num(prixTxt),
    })
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <label htmlFor="m-nom">Nom</label>
      <input id="m-nom" value={d.nom} onChange={(e) => set('nom', e.target.value)} required autoFocus maxLength={200} placeholder="Cire de soja, mèche coton 8 cm…" />

      <div className="row">
        <div className="field-half">
          <label htmlFor="m-cat">Catégorie</label>
          <select id="m-cat" value={d.categorie ?? ''} onChange={(e) => set('categorie', (e.target.value || null) as CategorieMatiere | null)}>
            <option value="">—</option>
            {(Object.keys(CATEGORIE_LABEL) as CategorieMatiere[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORIE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field-half">
          <label htmlFor="m-unite">Unité</label>
          <select id="m-unite" value={d.unite} onChange={(e) => set('unite', e.target.value as Unite)}>
            {(Object.keys(UNITE_LABEL) as Unite[]).map((u) => (
              <option key={u} value={u}>
                {u === 'piece' ? 'pièce' : u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field-half">
          <label htmlFor="m-stock">Stock actuel</label>
          <input id="m-stock" inputMode="decimal" value={stockTxt} onChange={(e) => setStockTxt(e.target.value)} />
        </div>
        <div className="field-half">
          <label htmlFor="m-seuil">Seuil d'alerte</label>
          <input id="m-seuil" inputMode="decimal" value={seuilTxt} onChange={(e) => setSeuilTxt(e.target.value)} placeholder="vide = pas d'alerte" />
        </div>
      </div>

      <div className="row">
        <div className="field-half">
          <label htmlFor="m-prix">Prix / unité (€)</label>
          <input id="m-prix" inputMode="decimal" value={prixTxt} onChange={(e) => setPrixTxt(e.target.value)} />
        </div>
        <div className="field-half">
          <label htmlFor="m-fourn">Fournisseur</label>
          <select id="m-fourn" value={d.fournisseur_id ?? ''} onChange={(e) => set('fournisseur_id', e.target.value || null)}>
            <option value="">—</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nom}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor="m-ref">Réf. fournisseur</label>
      <input id="m-ref" value={d.reference_fournisseur ?? ''} onChange={(e) => set('reference_fournisseur', e.target.value || null)} maxLength={100} />

      <label htmlFor="m-notes">Notes</label>
      <textarea id="m-notes" value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} maxLength={4000} />

      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={d.actif} onChange={(e) => set('actif', e.target.checked)} style={{ width: 'auto', minHeight: 0 }} />
        Matière active (suivie par l'assistant)
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
