import { useSearchParams } from 'react-router-dom'
import { useConnectInstagram, useDisconnectInstagram, useInstagramAccount } from '../lib/instagram'

export default function CompteInstagram() {
  const { data: account, isLoading } = useInstagramAccount()
  const connect = useConnectInstagram()
  const disconnect = useDisconnectInstagram()
  const [params] = useSearchParams()
  const erreur = params.get('erreur')
  const connecte = params.get('connecte') === '1'

  return (
    <>
      <h1>Instagram</h1>
      <p className="muted">
        Connecte ton compte Instagram Business/Creator pour publier directement depuis le
        planning — plus besoin de faire le copier-coller à la main.
      </p>

      {connecte && !isLoading && (
        <p className="card" style={{ color: 'var(--ok, green)' }}>
          Compte connecté ✓
        </p>
      )}
      {erreur && (
        <p className="card muted">Connexion échouée : {decodeURIComponent(erreur)}</p>
      )}

      {isLoading && <p className="muted">Chargement…</p>}

      {!isLoading && account && (
        <div className="card stack">
          <div>
            Connecté à <strong>@{account.ig_username}</strong>
          </div>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            Accès valable jusqu'au{' '}
            {new Date(account.token_expires_at).toLocaleDateString('fr-BE')} (renouvelé
            automatiquement).
          </div>
          <button type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            Déconnecter
          </button>
        </div>
      )}

      {!isLoading && !account && (
        <button className="primary" onClick={() => connect.mutate()} disabled={connect.isPending}>
          {connect.isPending ? 'Redirection…' : 'Connecter Instagram'}
        </button>
      )}

      {connect.isError && (
        <p className="muted">Erreur : {(connect.error as Error).message}</p>
      )}

      <p className="muted" style={{ marginTop: 24, fontSize: '0.8rem' }}>
        Proto : le compte doit être ajouté comme testeur sur l'app Meta tant qu'elle n'est pas
        passée en revue (App Review). Publication d'images seulement pour l'instant — pas de
        stories ni de reels.
      </p>
    </>
  )
}
