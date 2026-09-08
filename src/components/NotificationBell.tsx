import { useNavigate } from 'react-router-dom'
import { useNotificationsCount } from '../lib/notifications'
import { BellIcon } from './icons'

/** Fixe en haut de chaque écran (rendu une fois dans App, pas par page) : rappels de
 * planning en retard, suggestions de l'assistant et besoin matière y sont regroupés,
 * pour laisser l'écran "Aujourd'hui" à ce qui est prévu aujourd'hui. */
export default function NotificationBell() {
  const navigate = useNavigate()
  const count = useNotificationsCount()

  return (
    <button className="bell-fab" onClick={() => navigate('/notifications')} aria-label="Notifications">
      <BellIcon size={20} />
      {count > 0 && <span className="bell-badge">{count > 9 ? '9+' : count}</span>}
    </button>
  )
}
