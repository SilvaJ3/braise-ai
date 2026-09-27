import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useBesoinMatiereSignale } from './atelier'
import { alertesBoutiques, type AlerteBoutique } from './boutique-etat'
import { useMesBoutiquesEtat } from './boutiques'
import { useCommandes } from './commandes'
import { ymd } from './dates'
import { useEntries } from './entries'
import { supabase } from './supabase'

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

/** Horloge « toutes les minutes ». Les rappels sont filtrés sur l'heure courante : sans ce
 * tick, un rappel qui arrive à échéance pendant que l'app reste ouverte n'apparaîtrait jamais
 * (le rendu ne serait jamais relancé). On relit aussi l'heure au retour sur l'onglet, parce que
 * les minuteurs des navigateurs mobiles sont gelés en arrière-plan. */
function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return now
}

/** Rappels de planning en retard, non "vus". */
export function useRappelsDus() {
  const { data: entries = [] } = useEntries()
  const { data: dismissed = [] } = useDismissedReminders()
  const now = useNowMinute()
  return useMemo(() => {
    const vu = new Set(dismissed)
    return entries.filter(
      (e) => e.status !== 'publie' && e.reminder_at != null && new Date(e.reminder_at).getTime() <= now && !vu.has(e.id),
    )
  }, [entries, dismissed, now])
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

/** Nombre de suggestions non traitées. La cloche n'affiche qu'un nombre : on le demande au
 * serveur (head: true → aucune ligne rapatriée) plutôt que de charger les messages, et on le
 * garde une minute. */
function useSuggestionsCount(): number {
  const { data = 0 } = useQuery({
    queryKey: ['assistant_suggestions', 'count'],
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('assistant_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('statut', 'nouveau')
      if (error) throw error
      return count ?? 0
    },
  })
  return data
}

/**
 * Ce que les boutiques attendent de l'artisan : un relevé à valider, un bon à confirmer, un
 * message à lire, un réassort à traiter. Rien n'est envoyé ni stocké pour ça — la cloche le déduit
 * de ce qui existe déjà (voir `alertesBoutiques`), comme le reste de ses notifications.
 */
export function useAlertesBoutiques(): AlerteBoutique[] {
  const { data: etats = [] } = useMesBoutiquesEtat()
  const { data: commandes = [] } = useCommandes()
  return useMemo(
    () => alertesBoutiques(etats, commandes.filter((c) => c.type === 'boutique' && c.statut === 'demande')),
    [etats, commandes],
  )
}

/** Nombre total affiché sur la cloche : rappels + commandes proches de l'échéance +
 * suggestions assistant + ce que les boutiques attendent + 1 si besoin matière (un compte agrégé,
 * pas le détail — le détail vit dans Atelier et dans Notifications). Ne monte volontairement pas
 * useBesoinsMatiere : la cloche est présente sur tous les écrans protégés, elle se contente d'un
 * comptage (voir useBesoinMatiereSignale). */
export function useNotificationsCount(): number {
  const rappels = useRappelsDus()
  const commandes = useCommandesAAlerter()
  const suggestions = useSuggestionsCount()
  const besoinMatiere = useBesoinMatiereSignale()
  const boutiques = useAlertesBoutiques()
  return rappels.length + commandes.length + suggestions + boutiques.length + (besoinMatiere ? 1 : 0)
}
