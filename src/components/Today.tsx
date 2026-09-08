import { useMemo } from 'react'
import { ymd } from '../lib/dates'
import { useEntries } from '../lib/entries'
import { PLATFORM_LABEL, STATUS_LABEL } from '../lib/labels'
import Skeleton from './Skeleton'

// Rappels de planning en retard et suggestions de l'assistant vivent dans la cloche de
// notifications (écran /notifications) : cet écran ne garde que ce qui est prévu aujourd'hui.
export default function Today() {
  const { data: entries = [], isLoading } = useEntries()
  const today = ymd()

  const todayItems = useMemo(
    () => entries.filter((e) => e.date === today && e.status !== 'publie'),
    [entries, today],
  )

  if (isLoading) return <Skeleton rows={4} />

  return (
    <>
      <h2>À publier aujourd'hui</h2>
      {todayItems.length === 0 && <p className="empty">Rien de planifié pour aujourd'hui.</p>}
      {todayItems.map((e) => (
        <div className="card" key={e.id}>
          <div className="row">
            <strong>{e.title}</strong>
            <div className="spacer" />
            <span className="badge">{STATUS_LABEL[e.status]}</span>
          </div>
          {e.platform && <span className="muted">{PLATFORM_LABEL[e.platform]}</span>}
        </div>
      ))}
    </>
  )
}
