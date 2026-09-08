import { useNavigate, useParams } from 'react-router-dom'
import BoutiqueDetail from '../components/BoutiqueDetail'
import BoutiqueForm from '../components/BoutiqueForm'
import Skeleton from '../components/Skeleton'
import { useState } from 'react'
import { useBoutiques, useDeleteBoutique, useUpdateBoutique } from '../lib/boutiques'
import { STATUT_LABEL as COMMANDE_STATUT_LABEL, useCommandes } from '../lib/commandes'
import { fmtDateCourte, STATUT_LABEL, useArchiverDepot, useDepots } from '../lib/depots'
import { CANAL_LABEL } from '../lib/labels'

export default function BoutiqueFiche() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: boutiques = [], isLoading } = useBoutiques()
  const { data: depots = [] } = useDepots(id)
  const { data: commandes = [] } = useCommandes(id)
  const archiver = useArchiverDepot()
  const update = useUpdateBoutique()
  const del = useDeleteBoutique()
  const [editing, setEditing] = useState(false)
  const [voirArchives, setVoirArchives] = useState(false)

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
            <h2 style={{ margin: 0 }}>Commandes</h2>
            <div className="spacer" />
            <button className="link" onClick={() => navigate(`/boutiques/${boutique.id}/commande`)}>
              + Nouvelle
            </button>
          </div>
          {commandes.length === 0 && <p className="empty">Aucune commande pour cette boutique.</p>}
          {commandes.map((c) => (
            <div
              className="card"
              key={c.id}
              onClick={() => navigate(`/commandes/${c.id}`)}
              style={{ cursor: 'pointer', opacity: c.archived_at ? 0.55 : 1 }}
            >
              <div className="row">
                <strong>Pour le {fmtDateCourte(c.date_echeance)}</strong>
                <div className="spacer" />
                {c.archived_at && <span className="badge">Archivée</span>}
                <span className="badge">{COMMANDE_STATUT_LABEL[c.statut]}</span>
              </div>
            </div>
          ))}

          <div className="row" style={{ marginTop: 16 }}>
            <h2 style={{ margin: 0 }}>Bons de dépôt</h2>
            <div className="spacer" />
            <button className="link" onClick={() => navigate(`/boutiques/${boutique.id}/depot`)}>
              + Nouveau
            </button>
          </div>
          {(() => {
            const actifs = depots.filter((d) => !d.archived_at)
            const archives = depots.filter((d) => d.archived_at)
            const visibles = voirArchives ? depots : actifs
            return (
              <>
                {depots.length === 0 && <p className="empty">Aucun bon pour cette boutique.</p>}
                {depots.length > 0 && actifs.length === 0 && !voirArchives && (
                  <p className="empty">Aucun bon actif — {archives.length} archivé(s).</p>
                )}
                {visibles.map((d) => (
                  <div
                    className="card"
                    key={d.id}
                    style={{ opacity: d.archived_at ? 0.55 : 1 }}
                  >
                    <div className="row" onClick={() => navigate(`/depots/${d.id}`)} style={{ cursor: 'pointer' }}>
                      <strong>{d.numero ?? 'Brouillon'}</strong>
                      <span className="muted">· {fmtDateCourte(d.date_depot)}</span>
                      <div className="spacer" />
                      {d.archived_at && <span className="badge">Archivé</span>}
                      <span className="badge">{STATUT_LABEL[d.statut]}</span>
                    </div>
                    {d.send_error && d.statut !== 'envoye' && (
                      <p className="muted" style={{ margin: '6px 0 0', color: 'var(--accent)' }}>
                        Envoi à relancer
                      </p>
                    )}
                    <div className="row" style={{ marginTop: 8 }}>
                      <div className="spacer" />
                      <button
                        className="link"
                        onClick={() => archiver.mutate({ id: d.id, archiver: !d.archived_at })}
                      >
                        {d.archived_at ? 'Désarchiver' : 'Archiver'}
                      </button>
                    </div>
                  </div>
                ))}
                {archives.length > 0 && (
                  <button className="link" onClick={() => setVoirArchives((v) => !v)}>
                    {voirArchives ? 'Masquer les archivés' : `Voir les archivés (${archives.length})`}
                  </button>
                )}
              </>
            )
          })()}
        </>
      )}
    </>
  )
}
