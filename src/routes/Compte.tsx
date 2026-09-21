import { Link } from 'react-router-dom'
import { ChevronRightIcon, LogoutIcon } from '../components/icons'
import { useAuth } from '../lib/auth'
import { useEstAdmin } from '../lib/profil'
import { supabase } from '../lib/supabase'

// Menu d'ensemble : chaque réglage a sa propre page, pour que celle-ci reste courte.
const ENTREES = [
  { to: '/compte/mon-compte', label: 'Mon compte', hint: 'Formule, questions incluses, consommation' },
  { to: '/compte/informations', label: 'Mes informations', hint: 'Activité, lieu, canaux de vente' },
  { to: '/compte/coordonnees', label: 'Mes coordonnées', hint: "En-tête des bons de dépôt" },
  { to: '/compte/apparence', label: 'Apparence', hint: 'Couleurs de l’app' },
  { to: '/compte/notifications', label: 'Notifications', hint: 'Rappels et point hebdo' },
  { to: '/compte/mot-de-passe', label: 'Mot de passe', hint: 'Changer ton mot de passe' },
]

// Une entrée qui n'existe que pour l'administration : le serveur seul dit qui administre
// (`est_admin()`), donc la ligne apparaît après sa réponse — jamais par défaut.
const ENTREE_ADMIN = {
  to: '/compte/demandes',
  label: 'Demandes d’accès',
  hint: 'Valider ou refuser sans passer par le mail',
}

export default function Compte() {
  const { session } = useAuth()
  const admin = useEstAdmin()
  const entrees = admin.data === true ? [...ENTREES, ENTREE_ADMIN] : ENTREES

  return (
    <>
      <h1>Plus</h1>
      <p className="muted">{session?.user.email}</p>

      <div className="card" style={{ padding: 0 }}>
        {entrees.map((e, i) => (
          <Link
            key={e.to}
            to={e.to}
            className="row settings-row"
            style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}
          >
            <div>
              <div>{e.label}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {e.hint}
              </div>
            </div>
            <div className="spacer" />
            <ChevronRightIcon />
          </Link>
        ))}
      </div>

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
