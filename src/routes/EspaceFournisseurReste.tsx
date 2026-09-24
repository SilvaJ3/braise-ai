import { Link, useParams } from 'react-router-dom'
import { useEspaceBoutique } from '../lib/compte-boutique'
import { montant, quantite, totalRestant } from '../lib/espace-boutique'

// L'espace de la boutique — écran 4 : ce qui reste chez elle, pour cet artisan.
//
// Le restant ne se saisit pas : il se calcule (déposé + entrées − vendues − reprises), et il ne
// compte que les bons que la boutique a confirmés. Une ligne « reprise » est une pièce que
// l'artisan a récupérée : elle n'est pas facturée, elle sort du stock — c'est pour ça qu'elle est
// montrée à part des ventes.
export default function EspaceFournisseurReste() {
  const { partenaireId } = useParams<{ partenaireId: string }>()
  const { data, isLoading, error } = useEspaceBoutique()

  if (isLoading) return <p className="muted">Chargement…</p>
  if (error) return <p className="muted">{(error as Error).message}</p>
  if (data?.erreur) return <p className="empty">{data.erreur}</p>

  const fournisseur = data?.etat?.fournisseurs.find((f) => f.partenaire_id === partenaireId)
  if (!fournisseur) return <p className="empty">Cet artisan n'est plus rattaché à ta boutique.</p>

  const nom = fournisseur.artisan || 'Artisan'
  const total = totalRestant(fournisseur.pieces)

  return (
    <>
      <p className="muted" style={{ marginTop: 4 }}>
        <Link to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}`}>‹ Ses dépôts</Link>
      </p>
      <h1 style={{ marginTop: 8 }}>Chez {nom} : ce qui te reste</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {quantite(total)} pièce{total > 1 ? 's' : ''} encore chez toi
      </p>

      {fournisseur.pieces.length === 0 && (
        <p className="empty">Rien en stock pour l'instant : aucun bon confirmé avec cet artisan.</p>
      )}

      {fournisseur.pieces.map((p) => (
        <article className="card" key={p.cle || p.designation}>
          <div className="row">
            <strong>{p.designation}</strong>
            <div className="spacer" />
            <strong>{quantite(p.reste)}</strong>
          </div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
            déposé {quantite(p.depose)}
            {p.entre !== 0 ? ` · entré ${quantite(p.entre)}` : ''}
            {p.vendu !== 0 ? ` · vendu ${quantite(p.vendu)}` : ''}
            {p.repris !== 0 ? ` · repris ${quantite(p.repris)}` : ''}
            {p.prix ? ` · ${montant(p.prix)} la pièce` : ''}
          </p>
        </article>
      ))}

      {fournisseur.pieces.length > 0 && (
        <div className="row" style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <strong>Total restant</strong>
          <div className="spacer" />
          <strong>
            {quantite(total)} · {montant(fournisseur.pieces.reduce((s, p) => s + p.reste * p.prix, 0))}
          </strong>
        </div>
      )}

      <p className="muted" style={{ marginTop: 16, fontSize: '0.85rem' }}>
        Le restant se calcule à partir des bons confirmés : ce qui a été déposé, plus les entrées
        sans bon, moins les ventes et les reprises.
      </p>
    </>
  )
}
