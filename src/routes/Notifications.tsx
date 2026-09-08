import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Skeleton from '../components/Skeleton'
import { BellIcon, ChevronDownIcon, FlameIcon, SparkleIcon } from '../components/icons'
import { useBesoinsMatiere, fmtQty } from '../lib/atelier'
import { useGenerateIdeas, useMarkSuggestion, useSuggestions } from '../lib/assistant'
import { useEntries } from '../lib/entries'
import { logEvent } from '../lib/events'
import { Highlight } from '../lib/highlight'
import { STATUS_LABEL } from '../lib/labels'
import { useDismissReminder, useDismissedReminders, useRappelsDus } from '../lib/notifications'
import type { AssistantSuggestion } from '../lib/supabase'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' })

/** Icône + date + pastille (tant que non traité) : même en-tête pour les trois catégories. */
function NotifRow({
  icon,
  title,
  date,
  unread,
  children,
}: {
  icon: ReactNode
  title: ReactNode
  date?: string
  unread?: boolean
  children: ReactNode
}) {
  return (
    <div className="notif-row" style={{ opacity: unread === false ? 0.55 : 1 }}>
      <div className="notif-icon">{icon}</div>
      <div className="notif-body">
        <div className="row">
          <strong style={{ minWidth: 0 }}>{title}</strong>
          <div className="spacer" />
          {unread && <span className="notif-dot" />}
          {date && <span className="muted">{date}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}

// Une idée générée par l'assistant est stockée en "titre — détail" : on affiche le titre
// seul, le détail ne s'ouvre qu'au clic.
function splitIdea(s: AssistantSuggestion): { title: string; detail: string | null } {
  if (s.type !== 'idee_contenu') return { title: s.message, detail: null }
  const i = s.message.indexOf(' — ')
  return i === -1 ? { title: s.message, detail: null } : { title: s.message.slice(0, i), detail: s.message.slice(i + 3) }
}

function SuggestionBody({ s }: { s: AssistantSuggestion }) {
  const { title, detail } = splitIdea(s)
  const [open, setOpen] = useState(false)
  if (!detail) return <p className="muted" style={{ margin: '2px 0 0' }}>{<Highlight text={title} />}</p>
  return (
    <div>
      <button type="button" className={`idea-toggle${open ? ' is-open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span style={{ flex: 1 }}>{<Highlight text={title} />}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <p className="idea-detail">
          <Highlight text={detail} />
        </p>
      )}
    </div>
  )
}

const SUGGESTION_LABEL: Record<AssistantSuggestion['type'], string> = {
  idee_contenu: 'Idée ajoutée au planning',
  observation: 'Observation',
  relance_boutique: 'Relance boutique',
  alerte_stock: 'Stock à recommander',
}

export default function Notifications() {
  const navigate = useNavigate()
  const { isLoading: entriesLoading } = useEntries()
  const rappels = useRappelsDus()
  useDismissedReminders() // amorce le cache partagé avec la cloche
  const dismiss = useDismissReminder()
  const { data: suggestions = [] } = useSuggestions()
  const markSuggestion = useMarkSuggestion()
  const generate = useGenerateIdeas()
  const { data: besoins = [], isLoading: besoinsLoading } = useBesoinsMatiere()

  // Suggestions marquées "OK" pendant la session : restent visibles (grisées) avec un
  // bouton Rétablir, disparaissent au prochain chargement.
  const [done, setDone] = useState<Record<string, AssistantSuggestion>>({})

  function markDone(s: AssistantSuggestion) {
    logEvent('suggestion_done')
    setDone((d) => ({ ...d, [s.id]: s }))
    markSuggestion.mutate({ id: s.id, statut: 'traite' })
  }

  function restore(s: AssistantSuggestion) {
    setDone((d) => {
      const rest = { ...d }
      delete rest[s.id]
      return rest
    })
    markSuggestion.mutate({ id: s.id, statut: 'nouveau' })
  }

  const rien = !entriesLoading && rappels.length === 0 && besoins.length === 0 && suggestions.length === 0 && Object.keys(done).length === 0

  return (
    <>
      <button className="link" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        ← Retour
      </button>
      <h1>Notifications</h1>

      {entriesLoading && <Skeleton rows={3} />}

      {!entriesLoading &&
        rappels.map((e) => (
          <NotifRow key={e.id} icon={<BellIcon size={18} />} title={e.title} unread>
            <div className="row" style={{ marginTop: 2 }}>
              <span className="muted">{STATUS_LABEL[e.status]}</span>
              <div className="spacer" />
              <button className="link" onClick={() => dismiss.mutate(e.id)}>
                Vu
              </button>
            </div>
          </NotifRow>
        ))}

      {besoinsLoading && <Skeleton rows={1} />}
      {besoins.length > 0 && (
        <NotifRow
          icon={<FlameIcon size={18} />}
          title={`${besoins.length} matière(s) à commander`}
          unread
        >
          <p className="muted" style={{ margin: '2px 0 0', cursor: 'pointer' }} onClick={() => navigate('/atelier?tab=besoins')}>
            {besoins[0].matiere.nom}
            {besoins.length > 1 ? `, ${besoins.length - 1} autre(s)…` : ` — ${fmtQty(besoins[0].aCommander, besoins[0].matiere.unite)} à commander.`}
            {' '}→ Atelier
          </p>
        </NotifRow>
      )}

      {suggestions.map((s) => (
        <NotifRow key={s.id} icon={<SparkleIcon size={18} />} title={SUGGESTION_LABEL[s.type] ?? 'Suggestion'} date={fmtDate(s.created_at)} unread>
          <SuggestionBody s={s} />
          <div className="row" style={{ marginTop: 6 }}>
            <div className="spacer" />
            <button className="link" onClick={() => markDone(s)}>
              OK
            </button>
          </div>
        </NotifRow>
      ))}
      {Object.values(done)
        .filter((s) => !suggestions.some((q) => q.id === s.id))
        .map((s) => (
          <NotifRow key={s.id} icon={<SparkleIcon size={18} />} title={SUGGESTION_LABEL[s.type] ?? 'Suggestion'} date={fmtDate(s.created_at)} unread={false}>
            <SuggestionBody s={s} />
            <div className="row" style={{ marginTop: 6 }}>
              <span className="muted">✓ Traité</span>
              <div className="spacer" />
              <button className="link" onClick={() => restore(s)}>
                Rétablir
              </button>
            </div>
          </NotifRow>
        ))}

      {rien && <p className="empty">Rien pour l'instant.</p>}

      <div className="row" style={{ marginTop: 16 }}>
        <button
          className="link"
          onClick={() => {
            logEvent('generate_ideas')
            generate.mutate()
          }}
          disabled={generate.isPending}
        >
          {generate.isPending ? 'Génération…' : 'Générer des idées'}
        </button>
      </div>
      {generate.error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {(generate.error as Error).message}
        </p>
      )}
    </>
  )
}
