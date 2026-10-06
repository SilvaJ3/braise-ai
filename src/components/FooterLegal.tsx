import { Link } from 'react-router-dom'

/**
 * Le pied de page légal, en un seul endroit : les liens doivent être joignables depuis la
 * connexion ET depuis l'inscription (on ne fait pas accepter des conditions qu'on ne peut pas
 * lire), et pas seulement depuis l'intérieur de l'app.
 */
export default function FooterLegal() {
  return (
    <p className="muted" style={{ marginTop: 24, fontSize: '0.8rem', textAlign: 'center' }}>
      <Link to="/conditions" className="link" style={{ minHeight: 0, padding: 0, display: 'inline' }}>Conditions générales</Link>
      {' · '}
      <Link to="/confidentialite" className="link" style={{ minHeight: 0, padding: 0, display: 'inline' }}>Confidentialité</Link>
      {' · '}
      <Link to="/mentions-legales" className="link" style={{ minHeight: 0, padding: 0, display: 'inline' }}>Mentions légales</Link>
      {' · '}
      <a href="mailto:contact@braaise.io" className="link" style={{ minHeight: 0, padding: 0, display: 'inline' }}>contact@braaise.io</a>
    </p>
  )
}
