import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Demarrage from '../components/Demarrage'
import Fab from '../components/Fab'
import InstallHint from '../components/InstallHint'
import Today from '../components/Today'
import { logEvent } from '../lib/events'
import { useProfilCompte } from '../lib/profil'

// Écran d'accueil. Le mot qui s'affiche en haut appartient au compte (`message_accueil`) et non
// plus au code : « Gne Gne Gne Je t'aime » était lisible par n'importe quel nouvel artisan.
//
// La carte « Pour démarrer » remplace l'ancienne accroche « vierge » : celle-ci testait l'absence
// de produits et d'entrées en chargeant les deux listes complètes, là où la carte compte ce qui
// manque côté serveur (voir lib/demarrage.ts) et sait ce qui a déjà été fait.
export default function Aujourdhui() {
  const navigate = useNavigate()
  const { data: profil } = useProfilCompte()

  useEffect(() => {
    logEvent('open')
  }, [])

  return (
    <>
      <h1>Aujourd'hui</h1>
      {profil?.message_accueil && <p>{profil.message_accueil}</p>}
      <InstallHint />
      <Demarrage />
      <Today />
      <Fab onClick={() => navigate('/planning', { state: { new: true } })} />
    </>
  )
}
