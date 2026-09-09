import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Skeleton from '../components/Skeleton'
import { BellIcon, CalendarIcon, ChevronRightIcon, FlameIcon, SparkleIcon } from '../components/icons'
import { useBesoinsMatiere } from '../lib/atelier'
import { useSuggestions } from '../lib/assistant'
import { useBoutiques } from '../lib/boutiques'
import { useEntries } from '../lib/entries'
import { fmtDateCourte } from '../lib/depots'
import { useCommandesAAlerter, useRappelsDus } from '../lib/notifications'

function nomCommande(c: { type: string; boutique_id: string | null; client_nom: string | null }, boutiqueNom: Map<string, string>): string {
  return c.type === 'boutique' ? boutiqueNom.get(c.boutique_id ?? '') ?? 'Boutique' : c.client_nom ?? 'Personne'
}

const SUGGESTION_LABEL: Record<string, string> = {
  idee_contenu: 'Idée ajoutée au planning',
  observation: 'Observation',
  relance_boutique: 'Relance boutique',
  alerte_stock: 'Stock à recommander',
}

/** Un aperçu par catégorie, cliquable — le détail (actions incluses) vit dans l'écran
 * NotificationsCategorie. Évite d'ouvrir directement une liste dense en arrivant. */
function CategorieRow({
  to,
  icon,
  titre,
  apercu,
  nombre,
}: {
  to: string
  icon: ReactNode
  titre: string
  apercu: string
  nombre: number
}) {
  const navigate = useNavigate()
  return (
    <div className="notif-row" style={{ cursor: 'pointer' }} onClick={() => navigate(to)}>
      <div className="notif-icon">{icon}</div>
      <div className="notif-body">
        <div className="row">
          <strong>{titre}</strong>
          <div className="spacer" />
          <span className="notif-dot" />
          <ChevronRightIcon size={16} />
        </div>
        <p className="muted" style={{ margin: '2px 0 0' }}>
          {apercu}
          {nombre > 1 ? ` (${nombre})` : ''}
        </p>
      </div>
    </div>
  )
}

export default function Notifications() {
  const navigate = useNavigate()
  const { isLoading: entriesLoading } = useEntries()
  const rappels = useRappelsDus()
  const commandes = useCommandesAAlerter()
  const { data: boutiques = [] } = useBoutiques()
  const { data: suggestions = [] } = useSuggestions()
  const { data: besoins = [], isLoading: besoinsLoading } = useBesoinsMatiere()

  const boutiqueNom = new Map(boutiques.map((b) => [b.id, b.nom]))
  const chargement = entriesLoading || besoinsLoading
  const rien = !chargement && rappels.length === 0 && commandes.length === 0 && besoins.length === 0 && suggestions.length === 0

  return (
    <>
      <button className="link" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        ← Retour
      </button>
      <h1>Notifications</h1>

      {chargement && <Skeleton rows={3} />}

      {!chargement && (
        <div className="card">
          {rappels.length > 0 && (
            <CategorieRow to="/notifications/rappels" icon={<BellIcon size={18} />} titre="Rappels" apercu={rappels[0].title} nombre={rappels.length} />
          )}
          {commandes.length > 0 && (
            <CategorieRow
              to="/notifications/commandes"
              icon={<CalendarIcon size={18} />}
              titre="Commandes"
              apercu={`${nomCommande(commandes[0], boutiqueNom)} — pour le ${fmtDateCourte(commandes[0].date_echeance)}`}
              nombre={commandes.length}
            />
          )}
          {besoins.length > 0 && (
            <CategorieRow
              to="/notifications/atelier"
              icon={<FlameIcon size={18} />}
              titre="Atelier"
              apercu={`${besoins[0].matiere.nom} à commander`}
              nombre={besoins.length}
            />
          )}
          {suggestions.length > 0 && (
            <CategorieRow
              to="/notifications/assistant"
              icon={<SparkleIcon size={18} />}
              titre="L'assistant te propose"
              apercu={SUGGESTION_LABEL[suggestions[0].type] ?? suggestions[0].message}
              nombre={suggestions.length}
            />
          )}
          {rien && <p className="empty">Rien pour l'instant.</p>}
        </div>
      )}
    </>
  )
}
