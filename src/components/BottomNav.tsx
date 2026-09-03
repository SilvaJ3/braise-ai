import { NavLink } from 'react-router-dom'
import { CalendarIcon, FlameIcon, SparkleIcon, StoreIcon, SunIcon, UserIcon } from './icons'

const TABS = [
  { to: '/', label: "Aujourd'hui", Icon: SunIcon, end: true },
  { to: '/planning', label: 'Planning', Icon: CalendarIcon },
  { to: '/boutiques', label: 'Boutiques', Icon: StoreIcon },
  { to: '/atelier', label: 'Atelier', Icon: FlameIcon },
  { to: '/assistant', label: 'Assistant', Icon: SparkleIcon },
  { to: '/compte', label: 'Compte', Icon: UserIcon },
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
