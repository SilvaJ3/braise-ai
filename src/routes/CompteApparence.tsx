import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { DEFAULT_COLORS, loadColors, saveColors } from '../lib/theme'

export default function CompteApparence() {
  const navigate = useNavigate()
  const [colors, setColors] = useState(loadColors)

  function setColor(k: 'primary' | 'secondary', v: string) {
    const next = { ...colors, [k]: v }
    setColors(next)
    saveColors(next)
  }

  return (
    <>
      <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
        ← Compte
      </button>
      <h1>Apparence</h1>
      <div className="card stack">
        <p className="muted" style={{ marginTop: 0 }}>
          Choisis les couleurs de l'app.
        </p>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          Couleur principale
          <input
            type="color"
            value={colors.primary}
            onChange={(e) => setColor('primary', e.target.value)}
            style={{ width: 52, minHeight: 36, padding: 2 }}
          />
        </label>
        <label className="row" style={{ justifyContent: 'space-between' }}>
          Couleur secondaire
          <input
            type="color"
            value={colors.secondary}
            onChange={(e) => setColor('secondary', e.target.value)}
            style={{ width: 52, minHeight: 36, padding: 2 }}
          />
        </label>
        <div style={{ marginTop: 8 }}>
          <button
            className="link"
            onClick={() => {
              setColors(DEFAULT_COLORS)
              saveColors(DEFAULT_COLORS)
            }}
          >
            Réinitialiser
          </button>
        </div>
      </div>
    </>
  )
}
