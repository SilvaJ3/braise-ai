import { useNavigate } from 'react-router-dom'
import { useMemo, type ReactNode } from 'react'

// Le guide d'installation, dans l'app : Braaise est une PWA, pas une app de magasin.
// Sur iPhone, l'installation à l'écran d'accueil est la condition des notifications —
// c'est donc un pas-à-pas, pas une note de bas de page.

function systeme(): 'ios' | 'android' | 'autre' {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'autre'
}

function Etape({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
      <span className="muted" style={{ minWidth: 18 }}>
        {n}
      </span>
      <span>{children}</span>
    </div>
  )
}

export default function CompteTelephone() {
  const navigate = useNavigate()
  const s = useMemo(systeme, [])

  const ios = (
    <div className="card stack">
      <strong>iPhone / iPad</strong>
      <Etape n={1}>
        Vérifie ta version : Réglages → Général → Informations → Version. Il faut{' '}
        <strong>iOS 16.4 ou plus</strong>.
      </Etape>
      <Etape n={2}>
        Ouvre Braaise dans <strong>Safari</strong> — pas dans le navigateur intégré d'Instagram,
        Facebook, TikTok ou Telegram (ces fenêtres ne savent pas installer l'app).
      </Etape>
      <Etape n={3}>
        Bouton <strong>Partager</strong> (le carré avec une flèche) → fais défiler →{' '}
        <strong>Sur l'écran d'accueil</strong> → <strong>Ajouter</strong>.
      </Etape>
      <Etape n={4}>
        Ouvre Braaise <strong>depuis la nouvelle icône</strong>, pas depuis Safari : dans un onglet,
        l'iPhone refuse les notifications.
      </Etape>
      <Etape n={5}>
        Reviens ici, puis <strong>Notifications → Activer</strong> et <strong>Autoriser</strong> dans
        la fenêtre d'Apple.
      </Etape>
      <button className="link" onClick={() => navigate('/compte/notifications')}>
        Aller à Notifications →
      </button>
    </div>
  )

  const android = (
    <div className="card stack">
      <strong>Android</strong>
      <Etape n={1}>Ouvre Braaise dans Chrome.</Etape>
      <Etape n={2}>
        Installe (recommandé) : menu <strong>⋮</strong> → <strong>Ajouter à l'écran d'accueil</strong>{' '}
        → <strong>Installer</strong>.
      </Etape>
      <Etape n={3}>
        Reviens ici, puis <strong>Notifications → Activer</strong> et <strong>Autoriser</strong>. Sur
        Android, les notifications marchent aussi sans installer.
      </Etape>
      <button className="link" onClick={() => navigate('/compte/notifications')}>
        Aller à Notifications →
      </button>
    </div>
  )

  return (
    <>
      <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
        ← Compte
      </button>
      <h1>Sur mon téléphone</h1>
      <p className="muted">
        Braaise ne s'installe pas depuis un magasin d'applications : il s'ajoute depuis le
        navigateur. Sur iPhone, c'est cette installation qui ouvre le droit aux notifications.
      </p>

      {s === 'ios' ? ios : s === 'android' ? android : <>{ios}{android}</>}

      <div className="card stack">
        <strong>Ce que Braaise t'enverra</strong>
        <span className="muted">
          Deux choses, jamais plus : une confirmation quand une boutique confirme un bon, et une
          demande de réassort quand elle commande. Chaque appareil s'abonne séparément — si tu
          changes de téléphone, refais les étapes sur le nouveau.
        </span>
      </div>

      <div className="card stack">
        <strong>Si ça ne marche pas</strong>
        <span className="muted">
          « Non disponible sur cet appareil » : tu es sur iPhone dans un onglet Safari → installe,
          puis ouvre depuis l'icône.
        </span>
        <span className="muted">
          Pas de « Sur l'écran d'accueil » dans le menu Partager : la page est ouverte dans le
          navigateur intégré d'une app → ouvre-la dans Safari.
        </span>
        <span className="muted">
          Tu as refusé la question d'Apple : iOS ne la repose jamais. Désinstalle l'icône,
          réinstalle-la, puis recommence l'étape 5.
        </span>
        <span className="muted">
          Rien ne passe alors que tout est activé : l'app doit être ouverte depuis son icône
          (mode « app »), pas depuis un onglet.
        </span>
      </div>
    </>
  )
}
