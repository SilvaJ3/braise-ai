import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Fab from '../components/Fab'
import FournisseurForm from '../components/FournisseurForm'
import ImportWizard from '../components/ImportWizard'
import MatiereForm from '../components/MatiereForm'
import Skeleton from '../components/Skeleton'
import {
  CATEGORIE_LABEL,
  fmtQty,
  sousSeuil,
  useCreateFournisseur,
  useCreateMatiere,
  useDeleteFournisseur,
  useDeleteMatiere,
  useFournisseurs,
  useMatieres,
  useUpdateFournisseur,
  useUpdateMatiere,
} from '../lib/atelier'
import type { ImportEntity } from '../lib/importer'
import type { Fournisseur, MatierePremiere } from '../lib/supabase'

type Tab = 'matieres' | 'fournisseurs' | 'import'
const TABS: Tab[] = ['matieres', 'fournisseurs', 'import']

// Message DB lisible (doublon de nom = index unique par utilisateur).
function friendly(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (/duplicate key|unique/i.test(msg)) return 'Ce nom existe déjà.'
  return msg
}

function MatieresTab() {
  const { data: matieres = [], isLoading, error } = useMatieres()
  const { data: fournisseurs = [] } = useFournisseurs()
  const create = useCreateMatiere()
  const update = useUpdateMatiere()
  const del = useDeleteMatiere()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MatierePremiere | null>(null)
  const [showInactives, setShowInactives] = useState(false)

  const fournisseurNom = useMemo(() => new Map(fournisseurs.map((f) => [f.id, f.nom])), [fournisseurs])
  const shown = matieres.filter((m) => showInactives || m.actif)
  const alertes = matieres.filter((m) => m.actif && sousSeuil(m))
  const openForm = creating || editing !== null

  return (
    <>
      {isLoading && <Skeleton rows={4} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {creating && (
        <MatiereForm
          fournisseurs={fournisseurs}
          busy={create.isPending}
          error={create.error ? friendly(create.error) : null}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) => create.mutate(draft, { onSuccess: () => setCreating(false) })}
        />
      )}
      {editing && (
        <MatiereForm
          initial={editing}
          fournisseurs={fournisseurs}
          busy={update.isPending}
          error={update.error ? friendly(update.error) : null}
          onCancel={() => setEditing(null)}
          onSubmit={(patch) => update.mutate({ id: editing.id, patch }, { onSuccess: () => setEditing(null) })}
        />
      )}

      {!isLoading && !error && !openForm && (
        <>
          {alertes.length > 0 && (
            <div className="banner">
              <strong>À recommander</strong>
              {alertes.map((m) => (
                <div className="row" key={m.id} style={{ marginTop: 6 }}>
                  <span>{m.nom}</span>
                  <span className="muted">
                    · {fmtQty(m.stock_actuel, m.unite)} / seuil {fmtQty(m.seuil_alerte as number, m.unite)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ marginBottom: 8 }}>
            <span className="muted">{shown.length} matière(s)</span>
            <div className="spacer" />
            <button className="link" onClick={() => setShowInactives((v) => !v)}>
              {showInactives ? 'Masquer inactives' : 'Voir inactives'}
            </button>
          </div>

          {shown.length === 0 && (
            <p className="empty">Aucune matière. Ajoute-les une par une, ou importe ton inventaire (onglet Importer).</p>
          )}

          {shown.map((m) => (
            <div className="card" key={m.id} style={{ opacity: m.actif ? 1 : 0.5 }}>
              <div className="row">
                <strong>{m.nom}</strong>
                <div className="spacer" />
                {sousSeuil(m) && m.actif && <span className="badge">⚠️ sous seuil</span>}
                <span className="badge">{fmtQty(m.stock_actuel, m.unite)}</span>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {m.categorie && <span className="muted">{CATEGORIE_LABEL[m.categorie]}</span>}
                {m.seuil_alerte != null && <span className="muted">· seuil {fmtQty(m.seuil_alerte, m.unite)}</span>}
                {m.prix_unitaire != null && <span className="muted">· {m.prix_unitaire} €/{m.unite === 'piece' ? 'pc' : m.unite}</span>}
                {m.fournisseur_id && fournisseurNom.get(m.fournisseur_id) && (
                  <span className="muted">· {fournisseurNom.get(m.fournisseur_id)}</span>
                )}
              </div>
              {m.notes && <p style={{ margin: '8px 0 0' }}>{m.notes}</p>}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="link" onClick={() => setEditing(m)}>
                  Modifier
                </button>
                <div className="spacer" />
                <button
                  className="link"
                  onClick={() => {
                    if (confirm(`Supprimer « ${m.nom} » ?`)) del.mutate(m.id)
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!openForm && <Fab onClick={() => setCreating(true)} />}
    </>
  )
}

function FournisseursTab() {
  const { data: fournisseurs = [], isLoading, error } = useFournisseurs()
  const { data: matieres = [] } = useMatieres()
  const create = useCreateFournisseur()
  const update = useUpdateFournisseur()
  const del = useDeleteFournisseur()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Fournisseur | null>(null)

  const nbMatieres = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of matieres) if (x.fournisseur_id) m.set(x.fournisseur_id, (m.get(x.fournisseur_id) ?? 0) + 1)
    return m
  }, [matieres])
  const openForm = creating || editing !== null

  return (
    <>
      {isLoading && <Skeleton rows={3} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {creating && (
        <FournisseurForm
          busy={create.isPending}
          error={create.error ? friendly(create.error) : null}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) => create.mutate(draft, { onSuccess: () => setCreating(false) })}
        />
      )}
      {editing && (
        <FournisseurForm
          initial={editing}
          busy={update.isPending}
          error={update.error ? friendly(update.error) : null}
          onCancel={() => setEditing(null)}
          onSubmit={(patch) => update.mutate({ id: editing.id, patch }, { onSuccess: () => setEditing(null) })}
        />
      )}

      {!isLoading && !error && !openForm && (
        <>
          {fournisseurs.length === 0 && <p className="empty">Aucun fournisseur pour l'instant.</p>}
          {fournisseurs.map((f) => (
            <div className="card" key={f.id} style={{ opacity: f.actif ? 1 : 0.5 }}>
              <div className="row">
                <strong>{f.nom}</strong>
                <div className="spacer" />
                {f.delai_livraison_jours != null && <span className="badge">délai {f.delai_livraison_jours} j</span>}
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {f.email && (
                  <a className="muted" href={`mailto:${f.email}`}>
                    {f.email}
                  </a>
                )}
                {f.telephone && (
                  <a className="muted" href={`tel:${f.telephone}`}>
                    · {f.telephone}
                  </a>
                )}
                {f.site_web && (
                  <a className="muted" href={/^https?:\/\//.test(f.site_web) ? f.site_web : `https://${f.site_web}`} target="_blank" rel="noreferrer">
                    · site ↗
                  </a>
                )}
              </div>
              {nbMatieres.get(f.id) ? (
                <p className="muted" style={{ margin: '6px 0 0' }}>{nbMatieres.get(f.id)} matière(s)</p>
              ) : null}
              {f.notes && <p style={{ margin: '8px 0 0' }}>{f.notes}</p>}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="link" onClick={() => setEditing(f)}>
                  Modifier
                </button>
                <div className="spacer" />
                <button
                  className="link"
                  onClick={() => {
                    if (confirm(`Supprimer « ${f.nom} » ? Les matières liées seront conservées, sans fournisseur.`)) del.mutate(f.id)
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!openForm && <Fab onClick={() => setCreating(true)} />}
    </>
  )
}

export default function Atelier() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'matieres'
  const entityParam = params.get('entity')
  const initialEntity = (['produits', 'matieres_premieres', 'fournisseurs', 'boutiques'] as ImportEntity[]).includes(
    entityParam as ImportEntity,
  )
    ? (entityParam as ImportEntity)
    : undefined

  const go = (t: Tab) => setParams(t === 'matieres' ? {} : { tab: t }, { replace: true })

  return (
    <>
      <h1>Atelier</h1>
      <div className="subnav">
        <a className={tab === 'matieres' ? 'active' : ''} onClick={() => go('matieres')}>
          Matières
        </a>
        <a className={tab === 'fournisseurs' ? 'active' : ''} onClick={() => go('fournisseurs')}>
          Fournisseurs
        </a>
        <a className={tab === 'import' ? 'active' : ''} onClick={() => go('import')}>
          Importer
        </a>
      </div>

      {tab === 'matieres' && <MatieresTab />}
      {tab === 'fournisseurs' && <FournisseursTab />}
      {tab === 'import' && <ImportWizard key={initialEntity ?? 'default'} initialEntity={initialEntity} />}
    </>
  )
}
