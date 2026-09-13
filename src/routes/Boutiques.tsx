import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BoutiqueForm from '../components/BoutiqueForm'
import Fab from '../components/Fab'
import Skeleton from '../components/Skeleton'
import { useBoutiques, useCreateBoutique, useLastContacts } from '../lib/boutiques'
import { joursDepuis } from '../lib/dates'
import Commandes from './Commandes'
import Marches from './Marches'

const RELANCE_SEUIL_JOURS = 21 // ~3 semaines sans contact (même seuil que l'edge function)

type Tab = 'boutiques' | 'commandes' | 'marches'
const TABS: Tab[] = ['boutiques', 'commandes', 'marches']

function BoutiquesTab() {
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
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="muted">{shown.length} boutique(s)</span>
            <div className="spacer" />
            <button className="link" onClick={() => setShowInactives((v) => !v)}>
              {showInactives ? 'Masquer inactives' : 'Voir inactives'}
            </button>
          </div>

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

export default function Boutiques() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'boutiques'
  const go = (t: Tab) => setParams(t === 'boutiques' ? {} : { tab: t }, { replace: true })

  return (
    <>
      <h1>Boutiques</h1>
      <div className="subnav">
        <a className={tab === 'boutiques' ? 'active' : ''} onClick={() => go('boutiques')}>
          Boutiques
        </a>
        <a className={tab === 'commandes' ? 'active' : ''} onClick={() => go('commandes')}>
          Commandes
        </a>
        <a className={tab === 'marches' ? 'active' : ''} onClick={() => go('marches')}>
          Marché
        </a>
      </div>

      {tab === 'boutiques' && <BoutiquesTab />}
      {tab === 'commandes' && <Commandes />}
      {tab === 'marches' && <Marches />}
    </>
  )
}
