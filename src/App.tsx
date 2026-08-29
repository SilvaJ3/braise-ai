import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { CalendarIcon, LogoutIcon, UserIcon } from './components/icons'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import Compte from './routes/Compte'
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
      <nav className="topnav">
        <NavLink to="/planning">
          <CalendarIcon />
          Planning
        </NavLink>
        <NavLink to="/compte">
          <UserIcon />
          Compte
        </NavLink>
        <div className="spacer" />
        <button className="link" onClick={() => supabase.auth.signOut()} aria-label="Déconnexion">
          <LogoutIcon />
        </button>
      </nav>
      <Routes>
        <Route path="/planning" element={<Planning />} />
        <Route path="/compte" element={<Compte />} />
        <Route path="*" element={<Navigate to="/planning" replace />} />
      </Routes>
    </>
  )
}
