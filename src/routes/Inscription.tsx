import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  erreurFormulaire,
  MOT_DE_PASSE_MIN,
  normaliserCode,
  normaliserEmail,
} from '../../supabase/functions/_shared/inscription'
import { creerCompte } from '../lib/inscription'
import { supabase } from '../lib/supabase'

// L'inscription se fait sur invitation : sans code, pas de compte (l'inscription publique est
// fermée côté Supabase). Le code et l'email sont normalisés avant l'envoi — un code dicté au
// téléphone arrive souvent en minuscules, avec des espaces.
//
// Le lien d'invitation porte le code (et l'adresse, quand l'invitation est nominative) : les
// champs arrivent donc déjà remplis. C'est le seul intérêt de passer par un lien plutôt que par
// un code recopié — et ça se voit : la page le dit.
export default function Inscription() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const codeLien = params.get('code') ?? ''
  const emailLien = params.get('email') ?? ''
  const [code, setCode] = useState(() => normaliserCode(codeLien))
  const [email, setEmail] = useState(() => normaliserEmail(emailLien))
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const vientDuLien = Boolean(codeLien || emailLien)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const codeN = normaliserCode(code)
    const emailN = normaliserEmail(email)

    const local = erreurFormulaire({ code: codeN, email: emailN, motDePasse, confirmation })
    if (local) {
      setErreur(local)
      return
    }

    setBusy(true)
    setErreur(null)
    try {
      await creerCompte({ code: codeN, email: emailN, password: motDePasse })
      // Le compte vient d'être créé et son adresse est validée côté serveur : on connecte
      // directement, l'utilisatrice n'a pas à ressaisir ce qu'elle vient de taper.
      const { error } = await supabase.auth.signInWithPassword({ email: emailN, password: motDePasse })
      if (error) {
        setErreur(
          "Ton compte est créé, mais la connexion automatique a échoué. Va sur « Se connecter » avec l'email et le mot de passe que tu viens de choisir.",
        )
        return
      }
      navigate('/', { replace: true })
    } catch (err) {
      setErreur((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Créer mon compte</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {vientDuLien
          ? "Ton invitation est déjà remplie ci-dessous : il te reste à choisir un mot de passe, et c'est parti."
          : "Braaise s'ouvre sur invitation, pour rester utile à celles et ceux qui l'utilisent vraiment. Il te faut le code que tu as reçu."}
      </p>
      <form className="card stack" onSubmit={submit}>
        <label htmlFor="code">Code d'invitation</label>
        <input
          id="code"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          placeholder="XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="mdp">Mot de passe</label>
        <input
          id="mdp"
          type="password"
          autoComplete="new-password"
          minLength={MOT_DE_PASSE_MIN}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          required
        />
        <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
          Au moins {MOT_DE_PASSE_MIN} caractères, dont une minuscule, une majuscule et un chiffre.
          Une phrase dont tu te souviens vaut mieux qu'un mot court et compliqué.
        </p>

        <label htmlFor="mdp2" style={{ marginTop: 12 }}>
          Confirme le mot de passe
        </label>
        <input
          id="mdp2"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
        />

        {erreur && (
          <p className="muted" style={{ color: 'var(--accent)' }}>
            {erreur}
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Création…' : 'Créer mon compte'}
          </button>
        </div>
      </form>
      <p className="muted">
        Déjà un compte ? <Link to="/login">Se connecter</Link>
      </p>
    </>
  )
}
