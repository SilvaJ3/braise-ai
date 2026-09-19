import { useMemo, useState } from 'react'
import { joursAvecCommande, pastillesDuJour, type Famille } from '../lib/calendrier'
import { ymd } from '../lib/dates'
import type { Commande, ContentEntry } from '../lib/supabase'

/**
 * Une couleur par FAMILLE, jamais par statut. Le statut (idée, à faire, planifié, publié) est
 * écrit en toutes lettres dans la liste du jour et filtrable dans la vue Liste : le répéter en
 * quatre couleurs dans une grille de sept colonnes rendait la lecture impossible sans la légende,
 * et faisait porter une information par la couleur seule.
 *
 * Ce qui reste, et que la couleur ne peut pas dire, est porté par la forme : une pastille creuse
 * signale qu'il reste quelque chose à publier ce jour-là.
 */
const FAMILLE_COLOR: Record<Famille, string> = {
  contenu: '#4f9d5d',
  commande: '#4a7396',
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export default function MonthCalendar({
  entries,
  commandes = [],
  selected,
  onSelect,
}: {
  entries: ContentEntry[]
  /** Commandes à servir : leur échéance marque le jour, à côté des statuts de publication. */
  commandes?: Commande[]
  selected: string | null
  onSelect: (date: string | null) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })

  const byDay = useMemo(() => {
    const m = new Map<string, ContentEntry[]>()
    for (const e of entries) {
      if (!e.date) continue
      const list = m.get(e.date) ?? []
      list.push(e)
      m.set(e.date, list)
    }
    return m
  }, [entries])

  const commandesParJour = useMemo(() => joursAvecCommande(commandes), [commandes])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = ymd(new Date())

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(year, month, d)))

  function dotColors(date: string): Array<{ couleur: string; creux: boolean }> {
    return pastillesDuJour(byDay.get(date) ?? [], commandesParJour, date).map((p) => ({
      couleur: FAMILLE_COLOR[p.famille],
      creux: p.creux,
    }))
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
                {dotColors(date).map(({ couleur, creux }) => (
                  <i
                    key={couleur}
                    style={
                      creux
                        ? { background: 'transparent', boxShadow: `inset 0 0 0 1.5px ${couleur}` }
                        : { background: couleur }
                    }
                  />
                ))}
              </span>
            </button>
          ),
        )}
      </div>

      <div className="row cal-legend">
        {/* Trois entrées, pas cinq : deux familles et la forme qui dit s'il reste à publier. */}
        <span className="muted">
          <i
            className="cal-dot"
            style={{
              background: 'transparent',
              boxShadow: `inset 0 0 0 2px ${FAMILLE_COLOR.contenu}`,
            }}
          />{' '}
          À publier
        </span>
        <span className="muted">
          <i className="cal-dot" style={{ background: FAMILLE_COLOR.contenu }} /> Publié
        </span>
        <span className="muted">
          <i className="cal-dot" style={{ background: FAMILLE_COLOR.commande }} /> Commande
        </span>
      </div>
    </div>
  )
}
