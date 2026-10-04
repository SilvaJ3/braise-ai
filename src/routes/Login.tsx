import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import FooterLegal from '../components/FooterLegal'
import { estEspaceBoutique } from '../lib/espace'
import { MESSAGE_NEUTRE, urlRetourReinitialisation } from '../lib/mot-de-passe-oublie'
import { supabase } from '../lib/supabase'

export default function Login() {
  // Même page, deux entrées : sur le domaine de la boutique, le texte parle à une boutique et l'inscription par code d'invitation
  // (réservée aux artisans) ne s'y propose pas — un compte boutique est ouvert par Braaise, jamais en libre-service.
  const boutique = estEspaceBoutique(window.location.hostname, window.location.search)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Le formulaire « mot de passe oublié » n'existe que si on l'ouvre : la connexion ordinaire reste
  // la vue par défaut, et le lien est discret. Le message affiché est toujours le même, qu'un compte
  // existe ou non (voir `mot-de-passe-oublie.ts`).
  const [oublie, setOublie] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
  }

  async function envoyerLien(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setInfo(null)
    // On n'inspecte pas la réponse et on n'affiche pas d'erreur distincte : ce serait dire si
    // l'adresse a un compte. Le geste est le même dans tous les cas, le message aussi.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: urlRetourReinitialisation(window.location.origin),
    })
    setBusy(false)
    setInfo(MESSAGE_NEUTRE)
  }

  return (
    <>
      <form className="stack" onSubmit={submit}>
        {boutique ? (
          <>
            <p className="muted" style={{ margin: 0, fontWeight: 500 }}>
              Braaise
            </p>
            <h1>Espace boutique</h1>
            <p className="muted" style={{ margin: '0 0 12px' }}>
              Connecte-toi pour retrouver tes artisans, leurs bons de dépôt et tes ventes.
            </p>
          </>
        ) : (
          <h1>Braaise</h1>
        )}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="pw">Mot de passe</label>
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="muted" style={{ color: 'var(--accent)' }}>
            {error}
          </p>
        )}
        <div style={{ marginTop: 16 }}>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 12, fontSize: '0.9rem' }}>
          <button
            type="button"
            className="link"
            onClick={() => {
              setOublie((v) => !v)
              setError(null)
              setInfo(null)
            }}
          >
            Mot de passe oublié ?
          </button>
        </p>
      </form>

      {oublie && (
        <form className="stack" onSubmit={envoyerLien} style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Indique ton adresse email : le lien de réinitialisation part par mail.
          </p>
          <label htmlFor="email-oublie">Email</label>
          <input
            id="email-oublie"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {info && <p className="muted">{info}</p>}
          <div style={{ marginTop: 12 }}>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </div>
        </form>
      )}

      {boutique ? (
        <div className="muted" style={{ marginTop: 20, fontSize: '0.9rem' }}>
          <p style={{ margin: 0 }}>
            Tu as reçu un lien d'un artisan ? Ouvre-le directement : il fonctionne sans compte.
          </p>
          <p style={{ margin: '10px 0 0' }}>
            Pas encore de compte pour ta boutique ? <a href="mailto:contact@braaise.io">Écris-nous</a>.
          </p>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 20, fontSize: '0.9rem' }}>
          <Link to="/inscription">J'ai un code d'invitation</Link>
        </p>
      )}
      <FooterLegal />
    </>
  )
}
