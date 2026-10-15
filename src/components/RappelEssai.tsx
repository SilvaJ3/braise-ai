import { Link } from 'react-router-dom'
import { accesDuCompteAffiche, etatEssai, rappelEssai } from '../lib/abonnement'
import { useEtatDemarrage } from '../lib/demarrage'
import { useMonCompte } from '../lib/profil'

// L'essai à l'accueil : un rappel dans les trois derniers jours (avec ce que la personne a déjà
// fait), et la fin de l'essai dite en clair quand l'accès est fermé. Entre les deux, rien — l'essai
// qui court ne demande pas d'attention. Les règles viennent de `lib/abonnement.ts`, les mêmes que
// celles de « Mon compte » et du serveur.
export default function RappelEssai() {
  const { data: compte } = useMonCompte()
  const essai = compte
    ? etatEssai(compte.essai_fin, compte.abonnement_statut, {
        accesGratuit: compte.acces_gratuit,
        accesFermeLe: compte.acces_ferme_le,
      })
    : null
  const { etat } = useEtatDemarrage(essai?.enCours === true)

  if (!compte || !essai) return null

  const ferme = !accesDuCompteAffiche(compte)
  const texte = ferme
    ? essai.phrase
    : essai.enCours
      ? rappelEssai(essai.joursRestants, { produits: etat.produits, bons: etat.bons })
      : null
  if (!texte) return null

  return (
    <div className="card" role="status">
      <p style={{ margin: 0 }}>{texte}</p>
      <p style={{ margin: '8px 0 0' }}>
        <Link to="/compte/mon-compte" className="link">
          {ferme ? 'Reprendre un abonnement' : 'Ajouter ma carte'} →
        </Link>
      </p>
    </div>
  )
}
