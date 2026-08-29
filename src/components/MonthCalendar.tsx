import { useMemo, useState } from 'react'
import { STATUS_LABEL, STATUS_ORDER } from '../lib/labels'
import type { ContentEntry, ContentStatus } from '../lib/supabase'

const STATUS_COLOR: Record<ContentStatus, string> = {
  idee: '#b0a498',
  a_faire: '#e0932f',
  planifie: '#b5451b',
  publie: '#4f9d5d',
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function ymd(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MonthCalendar({
  entries,
  selected,
  onSelect,
}: {
  entries: ContentEntry[]
  selected: string | null
  onSelect: (date: string | null) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })

  const byDay = useMemo(() => {
    const m = new Map<string, ContentStatus[]>()
    for (const e of entries) {
      if (!e.date) continue
      const list = m.get(e.date) ?? []
      list.push(e.status)
      m.set(e.date, list)
    }
    return m
  }, [entries])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = ymd(new Date())

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(year, month, d)))

  function dotColors(date: string): string[] {
    const statuses = byDay.get(date)
    if (!statuses) return []
    const uniq = STATUS_ORDER.filter((s) => statuses.includes(s))
    return uniq.map((s) => STATUS_COLOR[s])
  }

  return (
    <div className="card">
      <div className="row">
        <button className="link" onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ‹
        </button>
        <div className="spacer" />
        <strong>
          {MONTHS[month]} {year}
        </strong>
        <div className="spacer" />
        <button className="link" onClick={() => setCursor(new Date(year, month + 1, 1))}>
          ›
        </button>
      </div>

      <div className="cal-grid cal-head">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="muted">
            {w}
          </span>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((date, i) =>
          date == null ? (
            <span key={i} />
          ) : (
            <button
              key={date}
              className={
                'cal-day' +
                (date === today ? ' is-today' : '') +
                (date === selected ? ' is-sel' : '')
              }
              onClick={() => onSelect(date === selected ? null : date)}
            >
              <span>{Number(date.slice(-2))}</span>
              <span className="cal-dots">
                {dotColors(date).slice(0, 4).map((c, j) => (
                  <i key={j} style={{ background: c }} />
                ))}
              </span>
            </button>
          ),
        )}
      </div>

      <div className="row cal-legend">
        {STATUS_ORDER.map((s) => (
          <span key={s} className="muted">
            <i className="cal-dot" style={{ background: STATUS_COLOR[s] }} /> {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  )
}
