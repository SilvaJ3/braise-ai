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
      {isLoading && <Skeleton rows={4} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {!isLoading && !error && (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="muted">{shown.length} commande(s)</span>
            <div className="spacer" />
            <button className="link" onClick={() => setVoirArchivees((v) => !v)}>
              {voirArchivees ? 'Masquer archivées' : 'Voir toutes'}
            </button>
          </div>

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
