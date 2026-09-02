import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useCreateProduit,
  useDeleteProduit,
  useProduits,
  useProfil,
  useSaveProfil,
  useUpdateProduit,
} from '../lib/produits'
import type { Produit, ProduitDraft, Saison } from '../lib/supabase'

const SAISONS: { v: Saison; label: string }[] = [
  { v: 'toute_annee', label: "Toute l'année" },
  { v: 'printemps', label: 'Printemps' },
  { v: 'ete', label: 'Été' },
  { v: 'automne', label: 'Automne' },
  { v: 'hiver', label: 'Hiver' },
  { v: 'noel', label: 'Noël' },
]

function ProfilEditor() {
  const { data: profil = '', isLoading } = useProfil()
  const save = useSaveProfil()
  const [txt, setTxt] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setTxt(profil)
  }, [profil, dirty])

  if (isLoading) return <p className="muted">…</p>

  return (
    <>
      <h2>Voix de marque</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Décris ton univers, ton ton, tes valeurs. L'assistant s'en sert pour te
        ressembler. Laisse vide pour le profil par défaut.
      </p>
      <textarea
        value={txt}
        onChange={(e) => {
          setTxt(e.target.value)
          setDirty(true)
        }}
        style={{ minHeight: 140 }}
        placeholder="Ex : Je fais des bougies coulées main, cires végétales, senteurs franches et un peu nostalgiques. Ton chaleureux, tutoiement, jamais mièvre…"
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="primary"
          disabled={save.isPending || !dirty}
          onClick={() => save.mutate(txt, { onSuccess: () => setDirty(false) })}
        >
          {save.isPending ? '…' : 'Enregistrer'}
        </button>
        {!dirty && save.isSuccess && <span className="muted">Enregistré ✓</span>}
      </div>
    </>
  )
}

const EMPTY: ProduitDraft = {
  nom: '',
  senteur: null,
  description: null,
  prix_vente: null,
  saison: null,
  actif: true,
}

function ProduitForm({
  initial,
  onDone,
}: {
  initial?: Produit
  onDone: () => void
}) {
  const create = useCreateProduit()
  const update = useUpdateProduit()
  const [d, setD] = useState<ProduitDraft>(
    initial
      ? {
          nom: initial.nom,
          senteur: initial.senteur,
          description: initial.description,
          prix_vente: initial.prix_vente,
          saison: initial.saison,
          actif: initial.actif,
        }
      : EMPTY,
  )
  const set = <K extends keyof ProduitDraft>(k: K, v: ProduitDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }))
  const busy = create.isPending || update.isPending

  function submit() {
    const body = { ...d, nom: d.nom.trim() }
    if (!body.nom) return
    if (initial) update.mutate({ id: initial.id, patch: body }, { onSuccess: onDone })
    else create.mutate(body, { onSuccess: onDone })
  }

  return (
    <div className="card stack">
      <label>Nom</label>
      <input value={d.nom} onChange={(e) => set('nom', e.target.value)} autoFocus />
      <label>Senteur</label>
      <input
        value={d.senteur ?? ''}
        onChange={(e) => set('senteur', e.target.value || null)}
        placeholder="figue, bois brûlé…"
      />
      <div className="row">
        <div className="field-half">
          <label>Prix (€)</label>
          <input
            type="number"
            inputMode="decimal"
            value={d.prix_vente ?? ''}
            onChange={(e) => set('prix_vente', e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className="field-half">
          <label>Saison</label>
          <select
            value={d.saison ?? ''}
            onChange={(e) => set('saison', (e.target.value || null) as Saison | null)}
          >
            <option value="">—</option>
            {SAISONS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label>Histoire / angle</label>
      <textarea
        value={d.description ?? ''}
        onChange={(e) => set('description', e.target.value || null)}
        placeholder="Ce qu'elle évoque, à qui elle parle…"
      />
      <label className="row" style={{ gap: 6 }}>
        <input
          type="checkbox"
          checked={d.actif}
          onChange={(e) => set('actif', e.target.checked)}
          style={{ width: 'auto', minHeight: 0 }}
        />
        Actif (proposé à l'assistant)
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={submit} disabled={busy || !d.nom.trim()}>
          Enregistrer
        </button>
        <button onClick={onDone}>Annuler</button>
      </div>
    </div>
  )
}

function ProduitsManager() {
  const { data: produits = [], isLoading } = useProduits()
  const del = useDeleteProduit()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Produit | null>(null)

  return (
    <>
      <div className="row">
        <h2 style={{ margin: 0 }}>Mes bougies</h2>
        <div className="spacer" />
        {!creating && !editing && (
          <button className="link" onClick={() => setCreating(true)}>
            + Ajouter
          </button>
        )}
      </div>

      {creating && <ProduitForm onDone={() => setCreating(false)} />}
      {editing && <ProduitForm initial={editing} onDone={() => setEditing(null)} />}

      {isLoading && <p className="muted">…</p>}
      {!isLoading && produits.length === 0 && !creating && (
        <p className="empty">Ajoute tes bougies pour des idées plus précises.</p>
      )}
      {!creating && !editing && (
        <p className="muted" style={{ margin: '4px 0 10px' }}>
          Tu as un export Shopify ou un tableau ?{' '}
          <Link to="/atelier?tab=import&entity=produits">Importer un fichier</Link>
        </p>
      )}
      {produits.map((p) => (
        <div className="card" key={p.id} style={{ opacity: p.actif ? 1 : 0.5 }}>
          <div className="row">
            <strong>{p.nom}</strong>
            {p.senteur && <span className="muted">· {p.senteur}</span>}
            <div className="spacer" />
            {p.prix_vente != null && <span className="badge">{p.prix_vente} €</span>}
          </div>
          {p.description && <p style={{ margin: '6px 0 0' }}>{p.description}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="link" onClick={() => setEditing(p)}>
              Modifier
            </button>
            <div className="spacer" />
            <button
              className="link"
              onClick={() => {
                if (confirm(`Supprimer « ${p.nom} » ?`)) del.mutate(p.id)
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

export default function Reglages() {
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Ce que sait l'assistant. Plus tu le renseignes, plus ses idées sont justes.
      </p>
      <ProfilEditor />
      <div style={{ height: 8 }} />
      <ProduitsManager />
    </>
  )
}
