import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function CompteMotDePasse() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    setMsg(error ? error.message : 'Mot de passe mis à jour.')
    if (!error) setPassword('')
  }

  return (
    <>
      <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
        ← Compte
      </button>
      <h1>Mot de passe</h1>
      <form className="card stack" onSubmit={submit}>
        <label htmlFor="np">Nouveau mot de passe</label>
        <input
          id="np"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {msg && <p className="muted">{msg}</p>}
        <div style={{ marginTop: 12 }}>
          <button className="primary" type="submit" disabled={busy || password.length < 8}>
            Changer
          </button>
        </div>
      </form>
    </>
  )
}
