import { Link } from 'react-router-dom'
import { etatAbonnementBoutique, type LigneAbonnementBoutique } from '../lib/abonnement-boutique'
import { useMonAbonnementBoutique } from '../lib/compte-boutique'

// « Mon abonnement » dans l'espace de la boutique : où en est l'accès, en une phrase, avec la date.
//
// LECTURE SEULE, volontairement : le paiement (Stripe) n'existe pas encore pour une boutique, donc
// aucun bouton « s'abonner » ni « gérer » — on ne montre pas un geste qui ne fait rien. Aucun prix
// non plus : il vivra dans Stripe. Le lien de la boutique, lui, ne dépend jamais de cet écran.
export default function EspaceAbonnement() {
  const { data, isLoading } = useMonAbonnementBoutique()

  if (isLoading) return <p className="muted">Chargement…</p>

  return (
    <>
      <p style={{ margin: '4px 0 0' }}>
        <Link to="/espace-boutique" className="link">
          ‹ Ma boutique
        </Link>
      </p>
      <h1 style={{ marginBottom: 12 }}>Mon abonnement</h1>
      {data ? <Etat ligne={data} /> : <p className="empty">Aucun abonnement à afficher pour l’instant.</p>}
    </>
  )
}

function Etat({ ligne }: { ligne: LigneAbonnementBoutique }) {
  const etat = etatAbonnementBoutique(ligne)
  return (
    <div className="card">
      <p style={{ margin: 0 }}>
        <span className="badge">{etat.badge}</span>
      </p>
      <p style={{ margin: '10px 0 0' }}>{etat.phrase}</p>
    </div>
  )
}
