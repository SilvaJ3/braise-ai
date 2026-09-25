import { Link } from 'react-router-dom'
import { fmtQty, useBesoinMatiereSignale, useBesoinsMatiere } from '../lib/atelier'
import Skeleton from './Skeleton'

// Ce qu'il faut racheter, sur l'écran d'accueil : c'est la question du matin à l'atelier, et la
// réponse était enfouie dans Atelier → À commander.
//
// Deux étages, pour ne rien coûter quand il n'y a rien à commander :
//   - `useBesoinMatiereSignale()` dit s'il y a lieu d'afficher le bloc. Il est déjà monté par la
//     cloche sur tous les écrans protégés (un comptage côté serveur, aucune ligne rapatriée) :
//     aucune requête de plus ici ;
//   - le détail (`useBesoinsMatiere`, cinq requêtes) n'est demandé que si le bloc s'affiche, donc
//     jamais dans le cas courant d'un atelier qui n'a rien à racheter.
//
// Le détail complet reste dans Atelier → À commander : c'est là qu'on groupe par fournisseur et
// qu'on crée la commande. L'accueil dit quoi racheter, il ne commande pas à la place de l'artisan.
export default function ACommander() {
  const signale = useBesoinMatiereSignale()
  // Le signal est volontairement large (il compte les lignes de commande en cours sans lire les
  // recettes) : il peut être vrai un peu trop tôt. C'est le détail qui décide de l'affichage, et
  // il n'y a jamais de titre « À commander » vide sous les yeux de l'artisan.
  return signale ? <DetailBesoin /> : null
}

function DetailBesoin() {
  const { data: besoins = [], isLoading } = useBesoinsMatiere()

  if (isLoading) {
    return (
      <>
        <h2>À commander</h2>
        <Skeleton rows={2} />
      </>
    )
  }
  if (besoins.length === 0) return null

  return (
    <>
      <h2>À commander</h2>
      <div className="card">
        {besoins.map((b, i) => (
          <div className="row" key={b.matiere.id} style={{ marginTop: i === 0 ? 0 : 8 }}>
            <span>{b.matiere.nom}</span>
            {b.fournisseur && <span className="muted">· {b.fournisseur.nom}</span>}
            <div className="spacer" />
            <span className="muted">{fmtQty(b.disponible, b.matiere.unite)} en stock</span>
            <span className="badge">à commander {fmtQty(b.aCommander, b.matiere.unite)}</span>
          </div>
        ))}
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Calculé à partir des commandes en cours et des recettes des produits.{' '}
          <Link to="/atelier?tab=besoins">Voir le détail et commander</Link>
        </p>
      </div>
    </>
  )
}
