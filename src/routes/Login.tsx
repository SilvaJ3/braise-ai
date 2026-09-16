import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
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
      <p className="muted" style={{ marginTop: 20, fontSize: '0.9rem' }}>
        <Link to="/inscription">J'ai un code d'invitation</Link>
      </p>
    </form>
  )
}
