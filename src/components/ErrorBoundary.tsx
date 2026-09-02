import { Component, type ErrorInfo, type ReactNode } from 'react'

type State = { error: Error | null }

// Filet de sécurité : sans ça, une erreur de rendu = écran blanc sans explication sur
// iPhone. Ici on affiche un message + bouton recharger, et on garde l'erreur en console.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur de rendu', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card stack" style={{ margin: 16 }}>
        <h2 style={{ marginTop: 0 }}>Oups, quelque chose a cassé.</h2>
        <p className="muted" style={{ wordBreak: 'break-word' }}>{this.state.error.message}</p>
        <div className="row">
          <button className="primary" onClick={() => window.location.reload()}>
            Recharger
          </button>
          <button
            onClick={() => {
              window.location.href = '/'
            }}
          >
            Accueil
          </button>
        </div>
      </div>
    )
  }
}
