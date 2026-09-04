import { useNavigate } from 'react-router-dom'
import EntrepriseForm from '../components/EntrepriseForm'

export default function CompteCoordonnees() {
  const navigate = useNavigate()
  return (
    <>
      <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
        ← Compte
      </button>
      <h1>Mes coordonnées</h1>
      <EntrepriseForm />
    </>
  )
}
