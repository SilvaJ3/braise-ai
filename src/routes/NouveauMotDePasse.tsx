import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FooterLegal from '../components/FooterLegal'
import { useAuth } from '../lib/auth'
import { MOT_DE_PASSE_MIN, motDePasseInvalide } from '../lib/mot-de-passe-oublie'
import { supabase } from '../lib/supabase'

// L'écran sur lequel tombe un lien de réinitialisation. Il est rendu HORS du tunnel d'accueil
// (voir App.tsx) : un compte neuf, encore dans l'onboarding, doit pouvoir changer son mot de passe.
// C'est le piège central de ce chantier — `/compte/mot-de-passe` existe, mais il vit dans le bloc
// réservé aux comptes ayant terminé l'onboarding, donc un lien de réinitialisation y serait
// redirigé vers `/onboarding` et ne servirait à rien.
//
// supabase-js crée la session à partir du fragment d'URL (`#access_token=…&type=recovery`) : il n'y
// a rien à décoder nous-mêmes. Tant qu'aucune session n'existe, le lien est expiré ou déjà servi.
export default function NouveauMotDePasse() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <p className="muted">Chargement…</p>

  if (!session) {
    return (
      <>
        <h1>Nouveau mot de passe</h1>
        <p className="muted">
          Ce lien n’est plus valable, ou il a déjà servi. Demande un nouveau lien depuis la page de
          connexion.
        </p>
        <p className="muted" style={{ marginTop: 20, fontSize: '0.9rem' }}>
          <Link to="/login">Retour à la connexion</Link>
        </p>
        <FooterLegal />
      </>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    // La règle vient de l'inscription, pas d'une seconde validation écrite ici : au moins 10
    // caractères, une minuscule, une majuscule, un chiffre, et la confirmation identique.
    const invalide = motDePasseInvalide(password, confirmation)
    if (invalide) {
      setError(invalide)
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(
        'Le mot de passe n’a pas pu être changé (le lien a peut-être expiré). Demande un nouveau lien.',
      )
      return
    }
    // La destination est « / » : un compte dont l'onboarding est fini arrive sur l'accueil, un
    // compte neuf retombe de lui-même sur /onboarding (voir App.tsx). On ne décide pas ici.
    navigate('/', { replace: true })
  }

  return (
    <>
      <h1>Nouveau mot de passe</h1>
      <form className="card stack" onSubmit={submit}>
        <label htmlFor="np">Nouveau mot de passe</label>
        <input
          id="np"
          type="password"
          autoComplete="new-password"
          minLength={MOT_DE_PASSE_MIN}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label htmlFor="np2">Confirme le mot de passe</label>
        <input
          id="np2"
          type="password"
          autoComplete="new-password"
          minLength={MOT_DE_PASSE_MIN}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
        />
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Au moins {MOT_DE_PASSE_MIN} caractères, dont une minuscule, une majuscule et un chiffre.
        </p>
        {error && (
          <p className="muted" style={{ color: 'var(--accent)' }}>
            {error}
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>
        </div>
      </form>
    </>
  )
}
