import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Skeleton from '../components/Skeleton'
import { ChevronDownIcon } from '../components/icons'
import { useBesoinsMatiere, fmtQty } from '../lib/atelier'
import { useGenerateIdeas, useMarkSuggestion, useSuggestions } from '../lib/assistant'
import { useEntries } from '../lib/entries'
import { logEvent } from '../lib/events'
import { Highlight } from '../lib/highlight'
import { STATUS_LABEL } from '../lib/labels'
import { useDismissReminder, useDismissedReminders, useRappelsDus } from '../lib/notifications'
import type { AssistantSuggestion } from '../lib/supabase'

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
  if (!detail) return <div>{<Highlight text={title} />}</div>
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

  return (
    <>
      <button className="link" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        ← Retour
      </button>
      <h1>Notifications</h1>

      {entriesLoading && <Skeleton rows={3} />}

      {!entriesLoading && rappels.length > 0 && (
        <>
          <h2>Rappels</h2>
          <div className="banner">
            {rappels.map((e) => (
              <div className="row" key={e.id} style={{ marginTop: 8 }}>
                <span>{e.title}</span>
                <span className="muted">· {STATUS_LABEL[e.status]}</span>
                <div className="spacer" />
                <button className="link" onClick={() => dismiss.mutate(e.id)}>
                  Vu
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {besoins.length > 0 && (
        <>
          <h2>Atelier</h2>
          <div
            className="card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/atelier?tab=besoins')}
          >
            <div className="row">
              <strong>{besoins.length} matière(s) à commander</strong>
              <div className="spacer" />
              <span className="badge">→ Atelier</span>
            </div>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              Calculé depuis les commandes en cours. {besoins[0].matiere.nom}
              {besoins.length > 1 ? `, ${besoins.length - 1} autre(s)…` : ` — ${fmtQty(besoins[0].aCommander, besoins[0].matiere.unite)} à commander.`}
            </p>
          </div>
        </>
      )}
      {besoinsLoading && <Skeleton rows={1} />}

      <div className="row">
        <h2 style={{ margin: 0 }}>L'assistant te propose</h2>
        <div className="spacer" />
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
      {suggestions.length === 0 && Object.keys(done).length === 0 && !generate.isPending && (
        <p className="empty">Rien pour l'instant. « Générer des idées » pour démarrer.</p>
      )}
      {suggestions.map((s) => (
        <div className="card" key={s.id}>
          <SuggestionBody s={s} />
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">{SUGGESTION_LABEL[s.type] ?? 'Suggestion'}</span>
            <div className="spacer" />
            <button className="link" onClick={() => markDone(s)}>
              OK
            </button>
          </div>
        </div>
      ))}
      {Object.values(done)
        .filter((s) => !suggestions.some((q) => q.id === s.id))
        .map((s) => (
          <div className="card" key={s.id} style={{ opacity: 0.55 }}>
            <SuggestionBody s={s} />
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">✓ Traité</span>
              <div className="spacer" />
              <button className="link" onClick={() => restore(s)}>
                Rétablir
              </button>
            </div>
          </div>
        ))}
    </>
  )
}
