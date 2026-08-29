import { useState } from 'react'

const KEY = 'install-hint-dismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
}

export default function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1' || isStandalone() || !isIOSSafari()
    } catch {
      return true
    }
  })

  if (hidden) return null

  return (
    <div className="install-hint">
      <div className="row">
        <span>
          📲 Ajoute l'app à ton écran d'accueil : <strong>Partager</strong> →{' '}
          <strong>Sur l'écran d'accueil</strong>.
        </span>
        <div className="spacer" />
        <button
          className="link"
          onClick={() => {
            try {
              localStorage.setItem(KEY, '1')
            } catch {
              /* ignore */
            }
            setHidden(true)
          }}
        >
          Masquer
        </button>
      </div>
    </div>
  )
}
