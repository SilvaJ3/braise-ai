import { Navigate, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import NotificationBell from './components/NotificationBell'
import { useAuth } from './lib/auth'
import { useProfilCompte } from './lib/profil'
import Assistant from './routes/Assistant'
import Atelier from './routes/Atelier'
import Aujourdhui from './routes/Aujourdhui'
import BoutiqueFiche from './routes/BoutiqueFiche'
import Boutiques from './routes/Boutiques'
import Compte from './routes/Compte'
import CompteApparence from './routes/CompteApparence'
import CompteCoordonnees from './routes/CompteCoordonnees'
import CompteInformations from './routes/CompteInformations'
import CompteMonCompte from './routes/CompteMonCompte'
import CompteMotDePasse from './routes/CompteMotDePasse'
import CompteNotifications from './routes/CompteNotifications'
import Commande from './routes/Commande'
import Demandes from './routes/Demandes'
import Depot from './routes/Depot'
import Inscription from './routes/Inscription'
import Login from './routes/Login'
import Marche from './routes/Marche'
import Notifications from './routes/Notifications'
import NotificationsCategorie from './routes/NotificationsCategorie'
import Onboarding from './routes/Onboarding'
import Planning from './routes/Planning'

export default function App() {
  const { session, loading } = useAuth()
  const profil = useProfilCompte(Boolean(session))

  if (loading) return <p className="muted">Chargement…</p>
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (profil.isLoading) return <p className="muted">Chargement…</p>

  // Tant que le tunnel d'accueil n'est pas terminé, rien d'autre n'est ouvert : ni la barre du
  // bas, ni un écran de données que la personne ne saurait pas encore remplir. Une ligne absente
  // (compte créé à la main dans Supabase) compte comme « tunnel à faire ». En revanche, une
  // lecture en erreur ne doit pas enfermer quelqu'un dans le tunnel : dans le doute, on le laisse
  // entrer.
  const tunnelAFaire = !profil.isError && (profil.data == null || profil.data.onboarding_completed_at == null)
  if (tunnelAFaire) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  return (
    <>
      <NotificationBell />
      <Routes>
        <Route path="/" element={<Aujourdhui />} />
        <Route path="/onboarding" element={<Navigate to="/" replace />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/notifications/:categorie" element={<NotificationsCategorie />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/boutiques" element={<Boutiques />} />
        <Route path="/boutiques/:id" element={<BoutiqueFiche />} />
        <Route path="/atelier" element={<Atelier />} />
        <Route path="/boutiques/:boutiqueId/depot" element={<Depot />} />
        <Route path="/depots/:depotId" element={<Depot />} />
        <Route path="/commandes/nouvelle" element={<Commande />} />
        <Route path="/boutiques/:boutiqueId/commande" element={<Commande />} />
        <Route path="/commandes/:commandeId" element={<Commande />} />
        <Route path="/marches/:id" element={<Marche />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/compte" element={<Compte />} />
        <Route path="/compte/mon-compte" element={<CompteMonCompte />} />
        <Route path="/compte/informations" element={<CompteInformations />} />
        <Route path="/compte/coordonnees" element={<CompteCoordonnees />} />
        <Route path="/compte/apparence" element={<CompteApparence />} />
        <Route path="/compte/notifications" element={<CompteNotifications />} />
        <Route path="/compte/mot-de-passe" element={<CompteMotDePasse />} />
        {/* Réservé à l'administration : la garde est dans l'écran, et le serveur refuse de toute
            façon de rendre les demandes à un compte qui n'administre pas. */}
        <Route path="/compte/demandes" element={<Demandes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}
