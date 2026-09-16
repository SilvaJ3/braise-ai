import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Plan, UsageMois } from '../../supabase/functions/_shared/compte'

// Profil de compte : ce que le tunnel d'accueil remplit, et ce que l'assistant lit pour savoir à
// qui il parle. Distinct de la « voix de marque » (texte libre, éditable dans Compte), qui vit
// dans la même ligne mais se modifie ailleurs.

export type Canaux = 'reseaux' | 'marches' | 'boutiques' | 'en_ligne'

export type ProfilCompte = {
  metier: string | null
  nom_commercial: string | null
  ville: string | null
  pays: string
  canaux: string[]
  plateformes: string[]
  contenu: string
  /** Mot affiché en haut de l'écran d'accueil. Vide = rien. */
  message_accueil: string | null
  /** Plan commercial : essai / fondateur / mensuel / annuel (voir _shared/compte.ts). */
  plan: Plan
  /** Dérogation de quota propre au compte, ou null (le quota vient alors du plan). */
  quota_mensuel: number | null
  onboarding_completed_at: string | null
  /** Date à laquelle la carte « Pour démarrer » a été masquée (null = jamais masquée). */
  demarrage_ferme_at: string | null
}

export const CANAUX: { valeur: Canaux; label: string; precisions: string }[] = [
  { valeur: 'reseaux', label: 'Réseaux sociaux', precisions: 'Instagram, Facebook, TikTok' },
  { valeur: 'marches', label: 'Marchés', precisions: 'marchés artisanaux, marchés de Noël' },
  { valeur: 'boutiques', label: 'Dépôt-vente', precisions: 'en boutique, chez un revendeur' },
  { valeur: 'en_ligne', label: 'Boutique en ligne', precisions: 'site, Etsy, Shopify…' },
]

export const PLATEFORMES = [
  { valeur: 'instagram', label: 'Instagram' },
  { valeur: 'facebook', label: 'Facebook' },
  { valeur: 'tiktok', label: 'TikTok' },
]

const CLE = ['profil-compte']

export function useProfilCompte(actif = true) {
  return useQuery({
    queryKey: CLE,
    enabled: actif,
    // Le tunnel et ses gardes lisent cette ligne à chaque navigation : inutile de la relire en
    // boucle, elle ne change que par nos propres écritures (qui invalident la clé).
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProfilCompte | null> => {
      const { data, error } = await supabase
        .from('assistant_profil')
        .select(
          'metier, nom_commercial, ville, pays, canaux, plateformes, contenu, message_accueil, plan, quota_mensuel, onboarding_completed_at, demarrage_ferme_at',
        )
        .maybeSingle()
      if (error) throw error
      return (data as ProfilCompte | null) ?? null
    },
  })
}

/**
 * Ce que le compte a consommé ce mois-ci : plan, quotas, tokens. Tout est calculé côté base sous
 * la RLS du compte appelant (`mon_compte()`), pour que l'affichage ne puisse pas mentir.
 */
export function useMonCompte() {
  return useQuery({
    queryKey: ['mon-compte'],
    staleTime: 60_000,
    queryFn: async (): Promise<UsageMois> => {
      const { data, error } = await supabase.rpc('mon_compte')
      if (error) throw error
      const ligne = (Array.isArray(data) ? data[0] : data) as UsageMois | undefined
      if (!ligne) throw new Error('consommation illisible')
      return ligne
    },
  })
}

function useInvaliderProfil() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: CLE })
    // La voix de marque est lue ailleurs dans la même ligne : elle doit se rafraîchir aussi.
    qc.invalidateQueries({ queryKey: ['assistant_profil'] })
    qc.invalidateQueries({ queryKey: ['mon-compte'] })
  }
}

export function useEnregistrerProfilCompte() {
  const invalider = useInvaliderProfil()
  return useMutation({
    mutationFn: async (patch: Partial<ProfilCompte>) => {
      const { error } = await supabase
        .from('assistant_profil')
        .upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: invalider,
  })
}

/** Dernière étape du tunnel : la ligne est marquée terminée, la garde d'entrée s'ouvre. */
export function useTerminerOnboarding() {
  const invalider = useInvaliderProfil()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('assistant_profil')
        .upsert(
          { onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
      if (error) throw error
    },
    onSuccess: invalider,
  })
}
