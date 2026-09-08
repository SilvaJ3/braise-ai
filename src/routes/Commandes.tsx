import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Fab from '../components/Fab'
import Skeleton from '../components/Skeleton'
import { useBoutiques } from '../lib/boutiques'
import { STATUT_LABEL, useCommandes } from '../lib/commandes'
import { fmtDateCourte } from '../lib/depots'

export default function Commandes() {
  const navigate = useNavigate()
  const { data: commandes = [], isLoading, error } = useCommandes()
  const { data: boutiques = [] } = useBoutiques()
  const [voirArchivees, setVoirArchivees] = useState(false)

  const boutiqueNom = useMemo(() => new Map(boutiques.map((b) => [b.id, b.nom])), [boutiques])

  const shown = useMemo(
    () =>
      commandes
        .filter((c) => voirArchivees || !c.archived_at)
        .sort((a, b) => a.date_echeance.localeCompare(b.date_echeance)),
    [commandes, voirArchivees],
  )

  return (
    <>
      <h1>Commandes</h1>

      <div className="subnav">
        <a className={!voirArchivees ? 'active' : ''} onClick={() => setVoirArchivees(false)}>
          En cours
        </a>
        <a className={voirArchivees ? 'active' : ''} onClick={() => setVoirArchivees(true)}>
          Toutes
        </a>
      </div>

      {isLoading && <Skeleton rows={4} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {!isLoading && !error && (
        <>
          {shown.length === 0 && <p className="empty">Aucune commande pour l'instant.</p>}

          {shown.map((c) => (
            <div
              className="card"
              key={c.id}
              onClick={() => navigate(`/commandes/${c.id}`)}
              style={{ cursor: 'pointer', opacity: c.archived_at ? 0.55 : 1 }}
            >
              <div className="row">
                <strong>{c.type === 'boutique' ? boutiqueNom.get(c.boutique_id ?? '') ?? 'Boutique' : c.client_nom}</strong>
                <div className="spacer" />
                {c.archived_at && <span className="badge">Archivée</span>}
                <span className="badge">{STATUT_LABEL[c.statut]}</span>
              </div>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                Pour le {fmtDateCourte(c.date_echeance)}
                {c.type === 'boutique' ? ' · Dépôt-vente' : ' · Commande personnelle'}
              </p>
            </div>
          ))}
        </>
      )}

      <Fab onClick={() => navigate('/commandes/nouvelle')} />
    </>
  )
}
