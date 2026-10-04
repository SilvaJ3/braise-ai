import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import FooterLegal from '../components/FooterLegal'
import { MESSAGE_NEUTRE, urlRetourReinitialisation } from '../lib/mot-de-passe-oublie'
import { supabase } from '../lib/supabase'

export default function Login() {
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
        <h1>Braaise</h1>
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

      <p className="muted" style={{ marginTop: 20, fontSize: '0.9rem' }}>
        <Link to="/inscription">J'ai un code d'invitation</Link>
      </p>
      <FooterLegal />
    </>
  )
}
