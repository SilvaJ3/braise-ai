import { Navigate, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import { useAuth } from './lib/auth'
import Assistant from './routes/Assistant'
import Atelier from './routes/Atelier'
import Aujourdhui from './routes/Aujourdhui'
import BoutiqueFiche from './routes/BoutiqueFiche'
import Boutiques from './routes/Boutiques'
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
      <Routes>
        <Route path="/" element={<Aujourdhui />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/boutiques" element={<Boutiques />} />
        <Route path="/boutiques/:id" element={<BoutiqueFiche />} />
        <Route path="/atelier" element={<Atelier />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/compte" element={<Compte />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}
