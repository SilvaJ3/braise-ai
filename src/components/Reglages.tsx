import { useMemo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UNITE_LABEL, useMatieres } from '../lib/atelier'
import {
  useCreateProduit,
  useDeleteProduit,
  useProduits,
  useProfil,
  useSaveProfil,
  useUpdateProduit,
} from '../lib/produits'
import { useDeleteRecetteLigne, useRecettes, useSaveRecetteLigne } from '../lib/recettes'
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

// Recette (BOM) d'un produit : quelle(s) matière(s), en quelle quantité, pour en fabriquer
// une unité. Sert au calcul du besoin matière (Atelier → À commander) ; rien d'autre.
function RecetteEditor({ produitId }: { produitId: string }) {
  const { data: matieres = [] } = useMatieres()
  const { data: recettes = [] } = useRecettes()
  const save = useSaveRecetteLigne()
  const del = useDeleteRecetteLigne()

  const lignes = useMemo(() => recettes.filter((r) => r.produit_id === produitId), [recettes, produitId])
  const matiereById = useMemo(() => new Map(matieres.map((m) => [m.id, m])), [matieres])
  const dejaAjoutees = new Set(lignes.map((l) => l.matiere_id))
  const disponibles = matieres.filter((m) => m.actif && !dejaAjoutees.has(m.id))

  if (matieres.length === 0) {
    return (
      <p className="muted" style={{ margin: '8px 0 0' }}>
        Ajoute des matières premières (Atelier) pour définir une recette.
      </p>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      {lignes.map((l) => {
        const m = matiereById.get(l.matiere_id)
        return (
          <div className="row" key={l.id} style={{ marginTop: 6 }}>
            <span style={{ flex: 1 }}>{m?.nom ?? '…'}</span>
            <input
              inputMode="decimal"
              aria-label={`Quantité de ${m?.nom ?? ''}`}
              value={String(l.quantite)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(',', '.'))
                if (Number.isFinite(n) && n > 0) save.mutate({ produit_id: produitId, matiere_id: l.matiere_id, quantite: n })
              }}
              style={{ width: 70, minHeight: 32, padding: '4px 8px', textAlign: 'right' }}
            />
            <span className="muted">{m ? UNITE_LABEL[m.unite] : ''}</span>
            <button type="button" className="del" aria-label={`Retirer ${m?.nom ?? ''}`} onClick={() => del.mutate(l.id)}>
              ×
            </button>
          </div>
        )
      })}
      {disponibles.length > 0 && (
        <select
          aria-label="Ajouter une matière à la recette"
          value=""
          onChange={(e) => {
            if (e.target.value) save.mutate({ produit_id: produitId, matiere_id: e.target.value, quantite: 1 })
            e.target.value = ''
          }}
          style={{ marginTop: lignes.length ? 8 : 0 }}
        >
          <option value="">+ Ajouter une matière…</option>
          {disponibles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function ProduitsManager() {
  const { data: produits = [], isLoading } = useProduits()
  const del = useDeleteProduit()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Produit | null>(null)
  const [recetteOuverte, setRecetteOuverte] = useState<string | null>(null)

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
            <button className="link" onClick={() => setRecetteOuverte((id) => (id === p.id ? null : p.id))}>
              {recetteOuverte === p.id ? 'Fermer la recette' : 'Recette'}
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
          {recetteOuverte === p.id && <RecetteEditor produitId={p.id} />}
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
