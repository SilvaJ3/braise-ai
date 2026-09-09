import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import { type ReactNode, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDownIcon, EyeIcon, FlameIcon, SparkleIcon, StoreIcon } from '../components/icons'
import { useBesoinsMatiere, fmtQty } from '../lib/atelier'
import { useGenerateIdeas, useMarkSuggestion, useSuggestions } from '../lib/assistant'
import { useBoutiques } from '../lib/boutiques'
import { STATUT_LABEL as COMMANDE_STATUT_LABEL } from '../lib/commandes'
import { fmtDateCourte } from '../lib/depots'
import { logEvent } from '../lib/events'
import { Highlight } from '../lib/highlight'
import { STATUS_LABEL } from '../lib/labels'
import { useCommandesAAlerter, useDismissReminder, useDismissedReminders, useRappelsDus } from '../lib/notifications'
import type { AssistantSuggestion } from '../lib/supabase'

type Categorie = 'rappels' | 'commandes' | 'atelier' | 'assistant'
const TITRES: Record<Categorie, string> = {
  rappels: 'Rappels',
  commandes: 'Commandes',
  atelier: 'Atelier',
  assistant: "L'assistant te propose",
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

// Chip + liseré de couleur par type, pour repérer la nature de la suggestion d'un coup d'œil.
const SUGGESTION_ICON: Record<AssistantSuggestion['type'], (props: { size?: number }) => ReactNode> = {
  idee_contenu: SparkleIcon,
  observation: EyeIcon,
  relance_boutique: StoreIcon,
  alerte_stock: FlameIcon,
}
const SUGGESTION_TINT: Record<AssistantSuggestion['type'], string> = {
  idee_contenu: 'suggestion-tile--idee',
  observation: 'suggestion-tile--observation',
  relance_boutique: 'suggestion-tile--relance',
  alerte_stock: 'suggestion-tile--stock',
}

// Entrée avec léger rebond, sortie en envol : la tuile traitée part plutôt que de disparaître
// sèchement. Respecte "reduced motion" via MotionConfig au niveau de la liste.
function SuggestionTile({ s, done, children }: { s: AssistantSuggestion; done?: boolean; children: ReactNode }) {
  const Icon = SUGGESTION_ICON[s.type] ?? SparkleIcon
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 120, rotate: 8, transition: { duration: 0.32, ease: 'easeIn' } }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={`suggestion-tile ${SUGGESTION_TINT[s.type] ?? ''}${done ? ' is-done' : ''}`}
    >
      <div className="suggestion-chip">
        <Icon size={14} />
      </div>
      <div className="suggestion-col">
        <span className="suggestion-kicker">{done ? '✓ Traité' : (SUGGESTION_LABEL[s.type] ?? 'Suggestion')}</span>
        {children}
      </div>
    </motion.div>
  )
}

function RappelsDetail() {
  const rappels = useRappelsDus()
  useDismissedReminders() // amorce le cache partagé avec la cloche
  const dismiss = useDismissReminder()

  if (rappels.length === 0) return <p className="empty">Plus aucun rappel en retard.</p>
  return (
    <>
      {rappels.map((e) => (
        <div className="card" key={e.id}>
          <div className="row">
            <span>{e.title}</span>
            <span className="muted">· {STATUS_LABEL[e.status]}</span>
            <div className="spacer" />
            <button className="link" onClick={() => dismiss.mutate(e.id)}>
              Vu
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

function CommandesDetail() {
  const navigate = useNavigate()
  const commandes = useCommandesAAlerter()
  const { data: boutiques = [] } = useBoutiques()
  const boutiqueNom = new Map(boutiques.map((b) => [b.id, b.nom]))

  if (commandes.length === 0) return <p className="empty">Aucune échéance proche.</p>
  return (
    <>
      {commandes.map((c) => (
        <div className="card" key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/commandes/${c.id}`)}>
          <div className="row">
            <strong>{c.type === 'boutique' ? boutiqueNom.get(c.boutique_id ?? '') ?? 'Boutique' : c.client_nom}</strong>
            <div className="spacer" />
            <span className="badge">{COMMANDE_STATUT_LABEL[c.statut]}</span>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Pour le {fmtDateCourte(c.date_echeance)}
            {c.type === 'boutique' ? ' · Dépôt-vente' : ' · Commande personnelle'}
          </p>
        </div>
      ))}
    </>
  )
}

function AtelierDetail() {
  const navigate = useNavigate()
  const { data: besoins = [] } = useBesoinsMatiere()

  if (besoins.length === 0) return <p className="empty">Rien à commander pour l'instant.</p>
  return (
    <>
      {besoins.map((b) => (
        <div className="card" key={b.matiere.id}>
          <div className="row">
            <strong>{b.matiere.nom}</strong>
            <div className="spacer" />
            <span className="badge">à commander {fmtQty(b.aCommander, b.matiere.unite)}</span>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {fmtQty(b.disponible, b.matiere.unite)} en stock · besoin {fmtQty(b.besoin, b.matiere.unite)}
            {b.fournisseur ? ` · ${b.fournisseur.nom}` : ' · sans fournisseur'}
          </p>
        </div>
      ))}
      <button className="link" onClick={() => navigate('/atelier?tab=besoins')}>
        Voir dans Atelier →
      </button>
    </>
  )
}

function AssistantDetail() {
  const { data: suggestions = [] } = useSuggestions()
  const markSuggestion = useMarkSuggestion()
  const generate = useGenerateIdeas()
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
      <div className="row" style={{ marginBottom: 8 }}>
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
      <MotionConfig reducedMotion="user">
        <AnimatePresence initial={false}>
          {suggestions.map((s) => (
            <SuggestionTile s={s} key={s.id}>
              <SuggestionBody s={s} />
              <div className="row" style={{ marginTop: 8 }}>
                <div className="spacer" />
                <button className="link" onClick={() => markDone(s)}>
                  OK
                </button>
              </div>
            </SuggestionTile>
          ))}
          {Object.values(done)
            .filter((s) => !suggestions.some((q) => q.id === s.id))
            .map((s) => (
              <SuggestionTile s={s} done key={s.id}>
                <SuggestionBody s={s} />
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="spacer" />
                  <button className="link" onClick={() => restore(s)}>
                    Rétablir
                  </button>
                </div>
              </SuggestionTile>
            ))}
        </AnimatePresence>
      </MotionConfig>
    </>
  )
}

export default function NotificationsCategorie() {
  const navigate = useNavigate()
  const { categorie } = useParams<{ categorie: Categorie }>()
  const cat: Categorie = categorie && categorie in TITRES ? categorie : 'rappels'

  return (
    <>
      <button className="link" onClick={() => navigate('/notifications')} style={{ marginBottom: 8 }}>
        ← Notifications
      </button>
      <h1>{TITRES[cat]}</h1>

      {cat === 'rappels' && <RappelsDetail />}
      {cat === 'commandes' && <CommandesDetail />}
      {cat === 'atelier' && <AtelierDetail />}
      {cat === 'assistant' && <AssistantDetail />}
    </>
  )
}
