import { useMemo, useState } from 'react'
import BoutiqueDetail from '../components/BoutiqueDetail'
import BoutiqueForm from '../components/BoutiqueForm'
import Fab from '../components/Fab'
import Skeleton from '../components/Skeleton'
import {
  useBoutiques,
  useCreateBoutique,
  useDeleteBoutique,
  useLastContacts,
  useUpdateBoutique,
} from '../lib/boutiques'
import { CANAL_LABEL } from '../lib/labels'
import type { Boutique } from '../lib/supabase'

const RELANCE_SEUIL_JOURS = 21 // ~3 semaines sans contact

function joursDepuis(date: string) {
  const ms = Date.now() - new Date(date + 'T00:00:00').getTime()
  return Math.floor(ms / 86_400_000)
}

export default function Boutiques() {
  const { data: boutiques = [], isLoading, error } = useBoutiques()
  const { data: lastContacts = {} } = useLastContacts()
  const create = useCreateBoutique()
  const update = useUpdateBoutique()
  const del = useDeleteBoutique()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Boutique | null>(null)
  const [selected, setSelected] = useState<Boutique | null>(null)
  const [showInactives, setShowInactives] = useState(false)

  const openForm = creating || editing !== null

  const shown = useMemo(
    () => boutiques.filter((b) => showInactives || b.actif),
    [boutiques, showInactives],
  )

  return (
    <>
      <h1>Boutiques</h1>

      <div className="subnav">
        <a className={!showInactives ? 'active' : ''} onClick={() => setShowInactives(false)}>
          Actives
        </a>
        <a className={showInactives ? 'active' : ''} onClick={() => setShowInactives(true)}>
          Toutes
        </a>
      </div>

      {isLoading && <Skeleton rows={4} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {creating && (
        <BoutiqueForm
          busy={create.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) => create.mutate(draft, { onSuccess: () => setCreating(false) })}
        />
      )}

      {editing && (
        <BoutiqueForm
          initial={editing}
          busy={update.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(patch) =>
            update.mutate({ id: editing.id, patch }, { onSuccess: () => setEditing(null) })
          }
        />
      )}

      {!isLoading && !error && !openForm && (
        <>
          {shown.length === 0 && <p className="empty">Aucune boutique pour l'instant.</p>}

          {shown.map((b) => {
            const last = lastContacts[b.id]
            const jours = last ? joursDepuis(last) : null
            const relance = jours !== null && jours >= RELANCE_SEUIL_JOURS
            const isSelected = selected?.id === b.id
            return (
              <div className="card" key={b.id}>
                <div className="row">
                  <strong>{b.nom}</strong>
                  <div className="spacer" />
                  {!b.actif && <span className="badge">inactive</span>}
                  {relance && (
                    <span className="badge" title="Pas de contact récent">
                      🔔 relance
                    </span>
                  )}
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  {b.adresse && <span className="muted">{b.adresse}</span>}
                  {b.canal_prefere && (
                    <span className="muted">· {CANAL_LABEL[b.canal_prefere]}</span>
                  )}
                </div>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  {last
                    ? `Dernier contact : il y a ${jours} j`
                    : 'Aucun contact enregistré'}
                </p>
                {b.notes && <p style={{ margin: '8px 0 0' }}>{b.notes}</p>}

                <div className="row" style={{ marginTop: 10 }}>
                  <button onClick={() => setSelected(isSelected ? null : b)}>
                    {isSelected ? 'Fermer' : 'Fiche'}
                  </button>
                  <button className="link" onClick={() => setEditing(b)}>
                    Modifier
                  </button>
                  <div className="spacer" />
                  <button
                    className="link"
                    onClick={() => {
                      if (confirm(`Supprimer « ${b.nom} » ?`)) del.mutate(b.id)
                    }}
                  >
                    Supprimer
                  </button>
                </div>

                {isSelected && (
                  <div style={{ marginTop: 12 }}>
                    <BoutiqueDetail boutique={b} />
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {!openForm && <Fab onClick={() => setCreating(true)} />}
    </>
  )
}
