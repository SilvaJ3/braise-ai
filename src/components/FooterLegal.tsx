import { Link } from 'react-router-dom'

/**
 * Le pied de page légal, en un seul endroit : les deux liens doivent être joignables depuis la
 * connexion ET depuis l'inscription (on ne fait pas accepter des conditions qu'on ne peut pas
 * lire), et pas seulement depuis l'intérieur de l'app.
 */
export default function FooterLegal() {
  return (
    <p className="muted" style={{ marginTop: 24, fontSize: '0.8rem', textAlign: 'center' }}>
      <Link to="/conditions" className="link">Conditions générales</Link>
      {' · '}
      <Link to="/confidentialite" className="link">Confidentialité</Link>
      {' · '}
      <a href="mailto:contact@braaise.io" className="link">contact@braaise.io</a>
    </p>
  )
}
