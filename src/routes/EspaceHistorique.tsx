import { Link, useParams } from 'react-router-dom'
import { useEspaceBoutique, useEspaceHistorique } from '../lib/compte-boutique'
import { jour, moisLisible, montant, quantite, texteStatutReleve } from '../lib/espace-boutique'

// L'espace de la boutique — l'historique de ses ventes déclarées à un artisan.
//
// LECTURE SEULE, et honnête sur ce qu'elle montre : la base ne rend que des TOTAUX par déclaration
// (ventes, reprises, montant facturable), pour les 12 dernières seulement. Pas de détail pièce par
// pièce — on ne l'invente pas ; on le dit.
export default function EspaceHistorique() {
  const { partenaireId } = useParams<{ partenaireId: string }>()
  const { data: etatBrut } = useEspaceBoutique()
  const { data: releves, isLoading, error } = useEspaceHistorique(partenaireId)

  const nom = etatBrut?.etat?.fournisseurs.find((f) => f.partenaire_id === partenaireId)?.artisan || 'cet artisan'

  return (
    <>
      <p className="muted" style={{ marginTop: 4 }}>
        <Link to={`/espace-boutique/fournisseur/${partenaireId}`}>‹ {nom}</Link>
      </p>
      <h1 style={{ marginTop: 8 }}>Mes ventes déclarées</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Ce que tu as déclaré à {nom}, mois par mois.
      </p>

      {isLoading && <p className="muted">Chargement…</p>}
      {error && <p className="muted">{(error as Error).message}</p>}
      {!isLoading && !error && (releves ?? []).length === 0 && <p className="empty">Aucune vente déclarée pour l'instant.</p>}

      {(releves ?? []).map((r, i) => {
        const statut = texteStatutReleve(r.statut)
        return (
          <article className="card" key={`${r.declaration ?? 'x'}-${i}`}>
            <div className="row">
              <strong>{moisLisible(r.declaration)}</strong>
              <div className="spacer" />
              <strong>{montant(r.facturable)}</strong>
            </div>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              {quantite(r.ventes)} vendue{r.ventes > 1 ? 's' : ''}
              {r.reprises > 0 ? `, ${quantite(r.reprises)} reprise${r.reprises > 1 ? 's' : ''}` : ''} · déclaré le {jour(r.declaration)}
            </p>
            {statut && (
              <p style={{ margin: '6px 0 0' }}>
                <span className="badge">{statut}</span>
              </p>
            )}
          </article>
        )
      })}

      {(releves ?? []).length >= 12 && (
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Les 12 dernières déclarations sont affichées ; les plus anciennes ne le sont pas ici.
        </p>
      )}
    </>
  )
}
