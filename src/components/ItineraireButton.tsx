import { useState } from 'react'
import { useProfilEntreprise } from '../lib/depots'
import type { Boutique } from '../lib/supabase'

// Destination = la boutique. Deux origines possibles au choix de l'utilisateur :
// - "domicile" = l'adresse renseignée dans Compte > Coordonnées (profil entreprise)
// - "ma position" = géolocalisation navigateur (demande l'autorisation au clic, jamais avant)
// Toujours vers Google Maps, qui sait démarrer sans origine imposée si aucune n'est fournie.
function destinationBoutique(boutique: Boutique): string {
  if (boutique.lat != null && boutique.lng != null) return `${boutique.lat},${boutique.lng}`
  return boutique.adresse ?? boutique.nom
}

function ouvrirItineraire(destination: string, origin?: string) {
  const params = new URLSearchParams({ api: '1', destination })
  if (origin) params.set('origin', origin)
  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noreferrer')
}

export default function ItineraireButton({ boutique }: { boutique: Boutique }) {
  const [open, setOpen] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)
  const { data: entreprise } = useProfilEntreprise()

  const destination = destinationBoutique(boutique)

  const depuisDomicile = () => {
    setOpen(false)
    ouvrirItineraire(destination, entreprise?.adresse || undefined)
  }

  const depuisPosition = () => {
    setLocError(null)
    if (!navigator.geolocation) {
      setLocError("Géolocalisation indisponible sur cet appareil.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOpen(false)
        ouvrirItineraire(destination, `${pos.coords.latitude},${pos.coords.longitude}`)
      },
      () => setLocError("Position refusée ou indisponible — vérifie l'autorisation de localisation."),
      { timeout: 10_000 },
    )
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="link"
        title="Itinéraire vers cette boutique"
        onClick={() => {
          setLocError(null)
          setOpen((v) => !v)
        }}
      >
        🧭 Itinéraire
      </button>

      {open && (
        <div
          className="card stack"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            zIndex: 21,
            width: 240,
          }}
        >
          <p className="muted" style={{ margin: 0 }}>Itinéraire au départ de…</p>
          <button onClick={depuisDomicile}>🏠 Mon adresse (domicile)</button>
          <button onClick={depuisPosition}>📍 Ma position actuelle</button>
          {locError && (
            <p className="muted" style={{ margin: 0, color: 'var(--accent)' }}>{locError}</p>
          )}
          <button className="link" onClick={() => setOpen(false)}>Annuler</button>
        </div>
      )}
    </div>
  )
}
