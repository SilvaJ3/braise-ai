import { NavLink } from 'react-router-dom'
import { CalendarIcon, FlameIcon, SparkleIcon, StoreIcon, SunIcon, UserIcon } from './icons'

// Boutiques regroupe Boutiques + Commandes (sous-onglets) ; Plus regroupe le compte et ses
// réglages — pour ne pas empiler les entrées ici à chaque nouvelle fonctionnalité.
const TABS = [
  { to: '/', label: "Aujourd'hui", Icon: SunIcon, end: true },
  { to: '/planning', label: 'Planning', Icon: CalendarIcon },
  { to: '/boutiques', label: 'Boutiques', Icon: StoreIcon },
  { to: '/atelier', label: 'Atelier', Icon: FlameIcon },
  { to: '/assistant', label: 'Assistant', Icon: SparkleIcon },
  { to: '/compte', label: 'Plus', Icon: UserIcon },
]

export default function BottomNav() {
  return (
    <nav className="tabbar">
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end}>
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
