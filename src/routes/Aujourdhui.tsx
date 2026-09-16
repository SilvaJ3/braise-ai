import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Fab from '../components/Fab'
import InstallHint from '../components/InstallHint'
import Today from '../components/Today'
import { useEntries } from '../lib/entries'
import { logEvent } from '../lib/events'
import { useProduits } from '../lib/produits'
import { useProfilCompte } from '../lib/profil'

// Écran d'accueil. Le mot qui s'affiche en haut appartient au compte (`message_accueil`) et non
// plus au code : « Gne Gne Gne Je t'aime » était lisible par n'importe quel nouvel artisan.
export default function Aujourdhui() {
  const navigate = useNavigate()
  const { data: profil } = useProfilCompte()
  const { data: produits = [] } = useProduits()
  const { data: entries = [] } = useEntries()

  useEffect(() => {
    logEvent('open')
  }, [])

  // Compte qui n'a encore rien enregistré : plutôt qu'un écran vide sous un titre, on dit quoi
  // faire d'abord. Le seuil est grossier (aucune entrée, aucun produit) : dès qu'il y a quelque
  // chose, l'écran normal reprend la main.
  const vierge = entries.length === 0 && produits.length === 0

  return (
    <>
      <h1>Aujourd'hui</h1>
      {profil?.message_accueil && <p>{profil.message_accueil}</p>}
      <InstallHint />

      {vierge ? (
        <div className="card">
          <strong>Pour démarrer</strong>
          <p className="muted" style={{ marginTop: 6 }}>
            Rien n'est encore enregistré. Le plus rapide : charger ton catalogue depuis un fichier —
            Braaise lit un Excel, un CSV, un PDF ou une photo de liste. Sinon, ajoute une idée au
            planning et tu verras l'assistant travailler.
          </p>
          <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className="primary"
              type="button"
              onClick={() => navigate('/atelier?tab=import&entity=produits')}
            >
              Importer mon catalogue
            </button>
            <button className="link" type="button" onClick={() => navigate('/compte/informations')}>
              Compléter mes informations
            </button>
          </div>
        </div>
      ) : (
        <Today />
      )}

      <Fab onClick={() => navigate('/planning', { state: { new: true } })} />
    </>
  )
}
