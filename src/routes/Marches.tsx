import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Fab from '../components/Fab'
import MarcheForm from '../components/MarcheForm'
import Skeleton from '../components/Skeleton'
import { useCreateMarche, useMarches, useVentesAgregees } from '../lib/marches'

const STATUT_LABEL = { ouvert: 'Ouvert', cloture: 'Clôturé' } as const

function MeilleuresVentes() {
  const { data: ventes = [], isLoading } = useVentesAgregees()
  const [lieu, setLieu] = useState('')

  const lieux = useMemo(
    () => [...new Set(ventes.flatMap((v) => Object.keys(v.lieux)))].sort(),
    [ventes],
  )
  const filtrees = useMemo(
    () =>
      lieu
        ? ventes
            .filter((v) => v.lieux[lieu])
            .map((v) => ({ ...v, quantite: v.lieux[lieu] }))
            .sort((a, b) => b.quantite - a.quantite)
        : ventes,
    [ventes, lieu],
  )

  if (isLoading) return <Skeleton rows={2} />
  if (ventes.length === 0) return null

  return (
    <>
      <div className="row" style={{ marginTop: 20, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Ce qui marche</h2>
        <div className="spacer" />
        {lieux.length > 1 && (
          <select aria-label="Filtrer par lieu" value={lieu} onChange={(e) => setLieu(e.target.value)}>
            <option value="">Tous les lieux</option>
            {lieux.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="card">
        {filtrees.map((v, i) => (
          <div
            key={v.produit_id ?? `libre:${v.designation}`}
            className="row"
            style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line)' : undefined }}
          >
            <div>
              <strong>{v.designation}</strong>
              {v.senteur && <span className="muted"> · {v.senteur}</span>}
              {!lieu && (
                <p className="muted" style={{ margin: '2px 0 0' }}>
                  {Object.entries(v.lieux)
                    .sort(([, a], [, b]) => b - a)
                    .map(([l, q]) => `${l} (${q})`)
                    .join(' · ')}
                </p>
              )}
            </div>
            <div className="spacer" />
            <strong>{v.quantite} vendu{v.quantite > 1 ? 's' : ''}</strong>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Marches() {
  const navigate = useNavigate()
  const { data: marches = [], isLoading, error } = useMarches()
  const create = useCreateMarche()
  const [creating, setCreating] = useState(false)

  return (
    <>
      {isLoading && <Skeleton rows={4} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {creating && (
        <MarcheForm
          busy={create.isPending}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) =>
            create.mutate(draft, {
              onSuccess: (id) => {
                setCreating(false)
                navigate(`/marches/${id}`)
              },
            })
          }
        />
      )}

      {!isLoading && !error && !creating && (
        <>
          {marches.length === 0 && <p className="empty">Aucun marché pour l'instant.</p>}

          {marches.map((m) => (
            <div className="card" key={m.id} onClick={() => navigate(`/marches/${m.id}`)} style={{ cursor: 'pointer' }}>
              <div className="row">
                <strong>{m.nom}</strong>
                <div className="spacer" />
                <span className="badge">{STATUT_LABEL[m.statut]}</span>
              </div>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                {m.lieu} · {new Date(m.date_marche + 'T00:00:00').toLocaleDateString('fr-BE')}
              </p>
            </div>
          ))}

          <MeilleuresVentes />
        </>
      )}

      {!creating && <Fab onClick={() => setCreating(true)} />}
    </>
  )
}
