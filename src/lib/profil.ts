import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { functionErrorMessage } from './push'
import type { FrequenceAbonnement } from './abonnement'
import type { ActionDemande, DemandeAcces } from './demandes-acces'
import type { Plan, UsageMois } from '../../supabase/functions/_shared/compte'
import type { ResultatValidation } from '../../supabase/functions/_shared/demande-acces'

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

/**
 * Ouvrir la page de paiement Stripe pour ce compte.
 *
 * La carte ne passe jamais par l'app : Stripe héberge la page, et l'écran ne fait qu'ouvrir
 * l'adresse rendue. La fréquence (`mois` ou `an`) est la seule décision qui remonte au serveur —
 * le prix, la remise fondateur et le client Stripe se décident là-bas (`stripe-checkout`).
 */
export function useOuvrirPaiement() {
  return useMutation({
    mutationFn: async (frequence: FrequenceAbonnement): Promise<string> => {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { frequence },
      })
      if (error) throw new Error(await functionErrorMessage(error))
      const url = (data as { url?: string } | null)?.url
      if (!url) throw new Error('Le paiement n’a pas pu être ouvert.')
      return url
    },
  })
}

/**
 * Ouvrir le portail Stripe du compte : changer de carte, télécharger les factures, résilier.
 *
 * Un compte qui n'a jamais rien payé n'a rien à y gérer : la fonction répond alors `url: null`
 * (et non une erreur) — l'écran n'ouvre rien et le dit.
 */
export function useOuvrirPortail() {
  return useMutation({
    mutationFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.functions.invoke('stripe-portal', { body: {} })
      if (error) throw new Error(await functionErrorMessage(error))
      return (data as { url?: string | null } | null)?.url ?? null
    },
  })
}

/**
 * Ce compte administre-t-il le produit ? Le serveur seul le sait (`est_admin()`, migration 0065) :
 * l'écran ne décide pas qui a le droit de voir les demandes, il demande.
 *
 * Une erreur compte pour « non » : un écran d'administration qui s'ouvre par défaut sur un doute
 * vaut moins qu'une ligne de menu qui manque.
 */
export function useEstAdmin() {
  return useQuery({
    queryKey: ['est-admin'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('est_admin')
      if (error) throw error
      return data === true
    },
  })
}

/**
 * Les demandes d'accès, lues par un administrateur (`demandes_acces_admin()`, migration 0065).
 * La table elle-même n'est lisible par personne côté client : c'est la fonction qui décide, et
 * elle rend le jeton des demandes encore à traiter — c'est lui qui permet d'agir.
 */
export function useDemandesAcces(actif = true) {
  return useQuery({
    queryKey: ['demandes-acces'],
    enabled: actif,
    queryFn: async (): Promise<DemandeAcces[]> => {
      const { data, error } = await supabase.rpc('demandes_acces_admin', { p_limite: 50 })
      if (error) throw error
      return (data ?? []) as DemandeAcces[]
    },
  })
}

/**
 * Valider ou refuser une demande. Le geste passe par l'edge function `demande-acces` — le même
 * chemin que le bouton du mail — et non par une écriture en base : c'est elle qui crée
 * l'invitation nominative, applique le plafond des places de fondateur et envoie le lien.
 *
 * Le jeton voyage dans l'adresse (`?t=`), la forme que la fonction connaît ; l'action est le seul
 * champ du formulaire.
 */
export function useTraiterDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      action,
      jeton,
    }: {
      action: ActionDemande
      jeton: string
    }): Promise<ResultatValidation> => {
      const form = new FormData()
      form.set('action', action)
      const { data, error } = await supabase.functions.invoke(
        `demande-acces?t=${encodeURIComponent(jeton)}`,
        { body: form },
      )
      if (error) throw new Error(await functionErrorMessage(error))
      return data as ResultatValidation
    },
    // L'écran relit la liste plutôt que de deviner le nouvel état : c'est la base qui tranche.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes-acces'] }),
  })
}
