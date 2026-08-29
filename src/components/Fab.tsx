import { PlusIcon } from './icons'

export default function Fab({ onClick, label = 'Nouveau' }: { onClick: () => void; label?: string }) {
  return (
    <button className="fab" onClick={onClick} aria-label={label}>
      <PlusIcon size={26} />
    </button>
  )
}
