import { Link, useSearchParams } from 'react-router-dom'
import {
  etatAbonnementBoutique,
  messageRetourPaiementBoutique,
  phraseAbonnerPendantOffert,
  prixBoutique,
  type LigneAbonnementBoutique,
} from '../lib/abonnement-boutique'
import {
  useMonAbonnementBoutique,
  useOuvrirPaiementBoutique,
  useOuvrirPortailBoutique,
  usePaiementBoutiqueOuvert,
} from '../lib/compte-boutique'

// « Mon abonnement » dans l'espace de la boutique : où en est l'accès, en une phrase, avec la date.
//
// Les boutons « S'abonner » et « Gérer » n'apparaissent que si le paiement est OUVERT (interrupteur de
// build `VITE_PAIEMENT_BOUTIQUE`, éteint par défaut : tant que les fonctions Stripe ne sont pas déployées,
// un bouton qui échouerait serait un geste annoncé et non livré) ET si l'état le permet. Le lien de la
// boutique, lui, ne dépend jamais de cet écran.
//
// Le prix est ÉCRIT ici (décision de JSB du 07/10/2026) : la boutique doit savoir ce qu'elle paie avant
// d'ouvrir une page de paiement. Les deux formules viennent de `PRIX_BOUTIQUE`, pas d'une phrase tapée
// à la main — et la TVA reste dite, parce qu'elle s'ajoute au paiement.
export default function EspaceAbonnement() {
  const { data, isLoading } = useMonAbonnementBoutique()
  const ouvert = usePaiementBoutiqueOuvert()
  const [params] = useSearchParams()
  const retour = messageRetourPaiementBoutique(params.get('paiement'))

  if (isLoading) return <p className="muted">Chargement…</p>

  return (
    <>
      <p style={{ margin: '4px 0 0' }}>
        <Link to="/espace-boutique" className="link">
          ‹ Ma boutique
        </Link>
      </p>
      <h1 style={{ marginBottom: 12 }}>Mon abonnement</h1>
      {retour && (
        <p className="card" role="status" style={{ margin: '0 0 12px' }}>
          {retour.texte}
        </p>
      )}
      {data ? <Etat ligne={data} ouvert={ouvert} /> : <p className="empty">Aucun abonnement à afficher pour l’instant.</p>}
    </>
  )
}

function Etat({ ligne, ouvert }: { ligne: LigneAbonnementBoutique; ouvert: boolean }) {
  const etat = etatAbonnementBoutique(ligne)
  return (
    <>
      <div className="card">
        <p style={{ margin: 0 }}>
          <span className="badge">{etat.badge}</span>
        </p>
        <p style={{ margin: '10px 0 0' }}>{etat.phrase}</p>
      </div>
      {ouvert && etat.peutSouscrire && <Souscrire ligne={ligne} />}
      {ouvert && etat.peutGerer && <Gerer />}
    </>
  )
}

/**
 * S'abonner : deux formules, au mois ou à l'année (engagement de douze mois), chacune avec son prix.
 * Le bouton se verrouille dès le clic : un second clic ouvrirait une seconde session de paiement.
 */
function Souscrire({ ligne }: { ligne: LigneAbonnementBoutique }) {
  const ouvrir = useOuvrirPaiementBoutique()
  const occupe = ouvrir.isPending || ouvrir.isSuccess
  const aller = (frequence: 'mensuel' | 'annuel') =>
    ouvrir.mutate(frequence, { onSuccess: (url) => window.location.assign(url) })
  const offert = phraseAbonnerPendantOffert(ligne)

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <strong>S’abonner</strong>
      {offert && <p style={{ margin: '8px 0 0' }}>{offert}</p>}
      <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>
        Les prix sont hors TVA : la TVA de ton pays s’ajoute au paiement, et le montant exact s’affiche
        sur la page de paiement avant que tu ne valides.
      </p>
      {ouvrir.isError && (
        <p className="muted" role="alert" style={{ margin: '8px 0 0' }}>
          {(ouvrir.error as Error).message}
        </p>
      )}
      <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
        <button className="primary" type="button" disabled={occupe} onClick={() => aller('mensuel')}>
          {occupe ? 'Ouverture…' : `S’abonner au mois — ${prixBoutique('mensuel')}`}
        </button>
        <button type="button" disabled={occupe} onClick={() => aller('annuel')}>
          S’abonner à l’année — {prixBoutique('annuel')}
        </button>
      </div>
    </section>
  )
}

/** Gérer : le portail Stripe — carte, factures, résiliation. Rien de ce qui s'y fait ne passe par notre code. */
function Gerer() {
  const ouvrir = useOuvrirPortailBoutique()
  const occupe = ouvrir.isPending || (ouvrir.isSuccess && ouvrir.data !== null)

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <strong>Gérer mon abonnement</strong>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>
        Changer de carte, retrouver tes factures, ou résilier.
      </p>
      {ouvrir.isError && (
        <p className="muted" role="alert" style={{ margin: '8px 0 0' }}>
          {(ouvrir.error as Error).message}
        </p>
      )}
      {ouvrir.isSuccess && ouvrir.data === null && (
        <p className="muted" role="status" style={{ margin: '8px 0 0' }}>
          Rien à gérer pour l’instant : aucun paiement n’a encore eu lieu.
        </p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button
          type="button"
          disabled={occupe}
          onClick={() => ouvrir.mutate(undefined, { onSuccess: (url) => url && window.location.assign(url) })}
        >
          {occupe ? 'Ouverture…' : 'Gérer mon abonnement'}
        </button>
      </div>
    </section>
  )
}
