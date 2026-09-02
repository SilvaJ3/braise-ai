import { useEffect, useState, type FormEvent } from 'react'
import { LogoutIcon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { disablePush, enablePush, pushStatus, sendTestPush, type PushStatus } from '../lib/push'
import { supabase } from '../lib/supabase'
import { DEFAULT_COLORS, loadColors, saveColors } from '../lib/theme'

export default function Compte() {
  const { session } = useAuth()
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [colors, setColors] = useState(loadColors)
  function setColor(k: 'primary' | 'secondary', v: string) {
    const next = { ...colors, [k]: v }
    setColors(next)
    saveColors(next)
  }

  const [push, setPush] = useState<PushStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  useEffect(() => {
    pushStatus().then(setPush)
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    setMsg(error ? error.message : 'Mot de passe mis à jour.')
    if (!error) setPassword('')
  }

  async function testPush() {
    setPushBusy(true)
    setPushMsg(null)
    try {
      await sendTestPush()
      setPushMsg('Notification de test envoyée.')
    } catch (e) {
      setPushMsg((e as Error).message)
    } finally {
      setPushBusy(false)
    }
  }

  async function togglePush(on: boolean) {
    setPushBusy(true)
    setPushMsg(null)
    try {
      if (on) {
        await enablePush()
        setPush('on')
      } else {
        await disablePush()
        setPush('off')
      }
    } catch (e) {
      setPushMsg((e as Error).message)
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <>
      <h1>Compte</h1>
      <p className="muted">{session?.user.email}</p>

      <h2>Apparence</h2>
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

      <h2>Notifications</h2>
      <div className="card">
        {push === null && <p className="muted">…</p>}
        {push === 'unsupported' && (
          <p className="muted">
            Non disponible sur cet appareil. Sur iPhone : ajoute d'abord l'app à
            l'écran d'accueil.
          </p>
        )}
        {push === 'denied' && (
          <p className="muted">
            Bloquées. Autorise les notifications pour ce site dans les réglages du
            navigateur.
          </p>
        )}
        {push === 'off' && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Reçois le rappel de tes publications et le point hebdo de l'assistant.
            </p>
            <button className="primary" disabled={pushBusy} onClick={() => togglePush(true)}>
              {pushBusy ? '…' : 'Activer'}
            </button>
          </>
        )}
        {push === 'on' && (
          <div className="row">
            <span>Activées ✅</span>
            <div className="spacer" />
            <button className="link" disabled={pushBusy} onClick={testPush}>
              Test
            </button>
            <button className="link" disabled={pushBusy} onClick={() => togglePush(false)}>
              Désactiver
            </button>
          </div>
        )}
        {pushMsg && (
          <p className="muted" style={{ color: 'var(--accent)' }}>
            {pushMsg}
          </p>
        )}
      </div>

      <h2>Mot de passe</h2>
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

      <button
        className="link"
        onClick={() => supabase.auth.signOut()}
        style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <LogoutIcon size={18} />
        Se déconnecter
      </button>
    </>
  )
}
