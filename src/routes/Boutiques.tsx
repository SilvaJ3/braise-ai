import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BoutiqueForm from '../components/BoutiqueForm'
import Fab from '../components/Fab'
import Skeleton from '../components/Skeleton'
import { useBoutiques, useCreateBoutique, useLastContacts } from '../lib/boutiques'
import { joursDepuis } from '../lib/dates'

const RELANCE_SEUIL_JOURS = 21 // ~3 semaines sans contact (même seuil que l'edge function)

export default function Boutiques() {
  const navigate = useNavigate()
  const { data: boutiques = [], isLoading, error } = useBoutiques()
  const { data: lastContacts = {} } = useLastContacts()
  const create = useCreateBoutique()

  const [creating, setCreating] = useState(false)
  const [showInactives, setShowInactives] = useState(false)

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

      {!isLoading && !error && !creating && (
        <>
          {shown.length === 0 && <p className="empty">Aucune boutique pour l'instant.</p>}

          {shown.map((b) => {
            const last = lastContacts[b.id]
            const jours = last ? joursDepuis(last) : null
            const relance = jours !== null && jours >= RELANCE_SEUIL_JOURS

            return (
              <div
                className="card"
                key={b.id}
                onClick={() => navigate(`/boutiques/${b.id}`)}
                style={{ cursor: 'pointer' }}
              >
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
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  {last ? `Dernier contact : il y a ${jours} j` : 'Aucun contact enregistré'}
                </p>
              </div>
            )
          })}
        </>
      )}

      {!creating && <Fab onClick={() => setCreating(true)} />}
    </>
  )
}
