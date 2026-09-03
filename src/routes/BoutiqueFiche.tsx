import { useNavigate, useParams } from 'react-router-dom'
import BoutiqueDetail from '../components/BoutiqueDetail'
import BoutiqueForm from '../components/BoutiqueForm'
import Skeleton from '../components/Skeleton'
import { useState } from 'react'
import { useBoutiques, useDeleteBoutique, useUpdateBoutique } from '../lib/boutiques'
import { fmtDateCourte, STATUT_LABEL, useDepots } from '../lib/depots'
import { CANAL_LABEL } from '../lib/labels'

export default function BoutiqueFiche() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: boutiques = [], isLoading } = useBoutiques()
  const { data: depots = [] } = useDepots(id)
  const update = useUpdateBoutique()
  const del = useDeleteBoutique()
  const [editing, setEditing] = useState(false)

  const boutique = boutiques.find((b) => b.id === id)

  if (isLoading) return <Skeleton rows={4} />
  if (!boutique) return <p className="empty">Boutique introuvable.</p>

  return (
    <>
      <button className="link" onClick={() => navigate('/boutiques')} style={{ marginBottom: 8 }}>
        ← Boutiques
      </button>

      {editing ? (
        <BoutiqueForm
          initial={boutique}
          busy={update.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(patch) =>
            update.mutate({ id: boutique.id, patch }, { onSuccess: () => setEditing(false) })
          }
        />
      ) : (
        <>
          <div className="row">
            <h1 style={{ margin: 0 }}>{boutique.nom}</h1>
            <div className="spacer" />
            {!boutique.actif && <span className="badge">inactive</span>}
          </div>
          {boutique.canal_prefere && (
            <p className="muted" style={{ margin: '4px 0 12px' }}>
              Canal préféré : {CANAL_LABEL[boutique.canal_prefere]}
            </p>
          )}

          <div className="row" style={{ marginBottom: 12 }}>
            <button onClick={() => setEditing(true)}>Modifier</button>
            <button
              className="link"
              onClick={() => {
                if (confirm(`Supprimer « ${boutique.nom} » ?`)) {
                  del.mutate(boutique.id, { onSuccess: () => navigate('/boutiques') })
                }
              }}
            >
              Supprimer
            </button>
          </div>

          <BoutiqueDetail boutique={boutique} />

          <div className="row" style={{ marginTop: 16 }}>
            <h2 style={{ margin: 0 }}>Bons de dépôt</h2>
            <div className="spacer" />
            <button className="link" onClick={() => navigate(`/boutiques/${boutique.id}/depot`)}>
              + Nouveau
            </button>
          </div>
          {depots.length === 0 && <p className="empty">Aucun bon pour cette boutique.</p>}
          {depots.map((d) => (
            <div
              className="card"
              key={d.id}
              onClick={() => navigate(`/depots/${d.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="row">
                <strong>{d.numero ?? 'Brouillon'}</strong>
                <span className="muted">· {fmtDateCourte(d.date_depot)}</span>
                <div className="spacer" />
                <span className="badge">{STATUT_LABEL[d.statut]}</span>
              </div>
              {d.send_error && d.statut !== 'envoye' && (
                <p className="muted" style={{ margin: '6px 0 0', color: 'var(--accent)' }}>
                  Envoi à relancer
                </p>
              )}
            </div>
          ))}
        </>
      )}
    </>
  )
}
