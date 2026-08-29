import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import Compte from './routes/Compte'
import Home from './routes/Home'
import Login from './routes/Login'
import Planning from './routes/Planning'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) return <p className="muted">Chargement…</p>
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <>
      <div className="row">
        <nav className="nav">
          <NavLink to="/" end>
            Aujourd'hui
          </NavLink>
          <NavLink to="/planning">Planning</NavLink>
          <NavLink to="/compte">Compte</NavLink>
        </nav>
        <div className="spacer" />
        <button className="link" onClick={() => supabase.auth.signOut()}>
          Déconnexion
        </button>
      </div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/compte" element={<Compte />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
