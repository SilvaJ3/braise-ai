import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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

function BoutiquesTab({
  nouvelle = false,
  onFermerNouvelle,
}: {
  /** Arrivée depuis la carte « Pour démarrer » : le formulaire s'ouvre tout de suite. */
  nouvelle?: boolean
  onFermerNouvelle?: () => void
}) {
  const { data: boutiques = [], isLoading, error } = useBoutiques()
  const { data: lastContacts = {} } = useLastContacts()
  const create = useCreateBoutique()

  const [creating, setCreating] = useState(false)
  const [showInactives, setShowInactives] = useState(false)

  // `?nouvelle=1` reçu de la carte « Pour démarrer » : le formulaire s'ouvre à l'arrivée, et le
  // paramètre est retiré en le refermant — un rechargement ou un retour ne doit pas le rouvrir.
  useEffect(() => {
    if (nouvelle) setCreating(true)
  }, [nouvelle])

  const fermer = () => {
    setCreating(false)
    onFermerNouvelle?.()
  }

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
          onCancel={fermer}
          onSubmit={(draft) => create.mutate(draft, { onSuccess: fermer })}
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
              // Lien pleine largeur plutôt qu'un div onClick : la carte est focalisable et
              // annoncée comme un lien par les lecteurs d'écran.
              <Link className="card" key={b.id} to={`/boutiques/${b.id}`}>
                <span className="row">
                  <strong>{b.nom}</strong>
                  <span className="spacer" />
                  {!b.actif && <span className="badge">inactive</span>}
                  {relance && (
                    <span className="badge" title="Pas de contact récent">
                      🔔 relance
                    </span>
                  )}
                </span>
                <span className="muted" style={{ display: 'block', margin: '6px 0 0' }}>
                  {last ? `Dernier contact : il y a ${jours} j` : 'Aucun contact enregistré'}
                </span>
              </Link>
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
  const nouvelle = params.get('nouvelle') === '1'

  return (
    <>
      <h1>Boutiques</h1>
      <div className="subnav" role="tablist" aria-label="Sections des boutiques">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'boutiques'}
          className={tab === 'boutiques' ? 'active' : ''}
          onClick={() => go('boutiques')}
        >
          Boutiques
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'commandes'}
          className={tab === 'commandes' ? 'active' : ''}
          onClick={() => go('commandes')}
        >
          Commandes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'marches'}
          className={tab === 'marches' ? 'active' : ''}
          onClick={() => go('marches')}
        >
          Marché
        </button>
      </div>

      {tab === 'boutiques' && (
        <BoutiquesTab nouvelle={nouvelle} onFermerNouvelle={() => go('boutiques')} />
      )}
      {tab === 'commandes' && <Commandes />}
      {tab === 'marches' && <Marches />}
    </>
  )
}
