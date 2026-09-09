import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useBesoinsMatiere } from './atelier'
import { useSuggestions } from './assistant'
import { useCommandes } from './commandes'
import { ymd } from './dates'
import { useEntries } from './entries'

// "Vu" sur un rappel de planning en retard : mémorisé en local (par appareil), pas de
// colonne DB. Passé par le cache react-query (plutôt qu'un useState par écran) pour que la
// cloche et l'écran Notifications restent synchronisés sans prop-drilling.
const DISMISSED_KEY = 'reminders-dismissed'
const DISMISSED_QUERY_KEY = ['reminders-dismissed']

function loadDismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(-200) : []
  } catch {
    return []
  }
}

function saveDismissed(ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

export function useDismissedReminders() {
  return useQuery({
    queryKey: DISMISSED_QUERY_KEY,
    queryFn: async () => loadDismissed(),
    initialData: loadDismissed,
    staleTime: Infinity,
  })
}

export function useDismissReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => id,
    onSuccess: (id) => {
      qc.setQueryData<string[]>(DISMISSED_QUERY_KEY, (old = []) => {
        const next = [...new Set([...old, id])].slice(-200)
        saveDismissed(next)
        return next
      })
    },
  })
}

/** Rappels de planning en retard, non "vus". */
export function useRappelsDus() {
  const { data: entries = [] } = useEntries()
  const { data: dismissed = [] } = useDismissedReminders()
  const now = Date.now()
  return useMemo(() => {
    const vu = new Set(dismissed)
    return entries.filter(
      (e) => e.status !== 'publie' && e.reminder_at != null && new Date(e.reminder_at).getTime() <= now && !vu.has(e.id),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, dismissed])
}

/** Commandes non livrées, non archivées, dont l'échéance est demain ou déjà dépassée. */
export function useCommandesAAlerter() {
  const { data: commandes = [] } = useCommandes()
  return useMemo(() => {
    const demain = ymd(new Date(Date.now() + 86_400_000))
    return commandes
      .filter((c) => !c.archived_at && c.statut !== 'livree' && c.date_echeance <= demain)
      .sort((a, b) => a.date_echeance.localeCompare(b.date_echeance))
  }, [commandes])
}

/** Nombre total affiché sur la cloche : rappels + commandes proches de l'échéance +
 * suggestions assistant + 1 si besoin matière (un compte agrégé, pas le détail — le détail
 * vit dans Atelier). */
export function useNotificationsCount(): number {
  const rappels = useRappelsDus()
  const commandes = useCommandesAAlerter()
  const { data: suggestions = [] } = useSuggestions()
  const { data: besoins = [] } = useBesoinsMatiere()
  return rappels.length + commandes.length + suggestions.length + (besoins.length > 0 ? 1 : 0)
}
