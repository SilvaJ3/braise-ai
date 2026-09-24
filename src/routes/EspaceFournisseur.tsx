import { Link, useParams } from 'react-router-dom'
import { useEspaceBons, useEspaceBoutique } from '../lib/compte-boutique'
import { jour, montant, quantite, statutBon, totalRestant } from '../lib/espace-boutique'

// L'espace de la boutique — écran 3 : les dépôts d'un artisan, un par un.
//
// Chaque bon porte sa date, son numéro, son état (reçu, ou pas encore), ses pièces et sa valeur :
// c'est le papier qu'elle a signé à l'atelier, montré tel qu'il est. Les brouillons n'y sont pas —
// un bon en brouillon n'a jamais quitté l'atelier et n'arrive pas ici (le filtre est dans la base).
//
// Aucun bouton : confirmer un bon, déclarer les ventes du mois et demander un réassort existent
// depuis le lien de la boutique, mais ne sont pas cliquables ici — la démonstration s'arrête à ce
// qu'elle reçoit.
export default function EspaceFournisseur() {
  const { partenaireId } = useParams<{ partenaireId: string }>()
  const { data: etatBrut } = useEspaceBoutique()
  const { data: bons, isLoading, error } = useEspaceBons(partenaireId)

  const fournisseur = etatBrut?.etat?.fournisseurs.find((f) => f.partenaire_id === partenaireId)
  const nom = fournisseur?.artisan || 'Artisan'

  return (
    <>
      <p className="muted" style={{ marginTop: 4 }}>
        <Link to="/espace-boutique">‹ Mes fournisseurs</Link>
      </p>
      <h1 style={{ marginTop: 8 }}>{nom}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {isLoading
          ? 'Chargement…'
          : `${bons?.length ?? 0} dépôt${(bons?.length ?? 0) > 1 ? 's' : ''} reçu${(bons?.length ?? 0) > 1 ? 's' : ''}`}
      </p>

      {error && <p className="muted">{(error as Error).message}</p>}
      {!isLoading && !error && (bons?.length ?? 0) === 0 && (
        <p className="empty">Aucun dépôt de cet artisan pour l'instant.</p>
      )}

      {(bons ?? []).map((b) => {
        const st = statutBon(b)
        return (
          <article className="card" key={b.bon_id}>
            <div className="row">
              <strong>{b.numero ? `Bon ${b.numero}` : 'Bon sans numéro'}</strong>
              <div className="spacer" />
              <span className="muted">{jour(b.date)}</span>
            </div>
            <p style={{ margin: '6px 0 10px' }}>
              <span className="badge">{st.texte}</span>
            </p>
            {b.lignes.map((l, i) => (
              <div className="row" key={`${b.bon_id}-${i}`} style={{ padding: '4px 0' }}>
                <span>{l.designation}</span>
                <div className="spacer" />
                <span className="muted">
                  {quantite(l.quantite)} × {montant(l.prix)}
                </span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <strong>{quantite(b.pieces)} pièces</strong>
              <div className="spacer" />
              <strong>{montant(b.valeur)}</strong>
            </div>
          </article>
        )
      })}

      {fournisseur && (
        <Link
          to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}/reste`}
          className="card"
          style={{ display: 'block' }}
        >
          <div className="row">
            <strong>Ce qui te reste de {nom}</strong>
            <div className="spacer" />
            <strong>{quantite(totalRestant(fournisseur.pieces))} pièces</strong>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Pièce par pièce, ce qui n'est pas encore vendu. ›
          </p>
        </Link>
      )}
    </>
  )
}
