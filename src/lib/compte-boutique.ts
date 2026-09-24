// Les appels de l'espace de la boutique connectée — les seuls endroits qui parlent au réseau pour
// cet espace. Les formes et les calculs vivent dans `lib/espace-boutique.ts` (pur, testable).
//
// Trois fonctions de la base (migration 0067), toutes `security definer` et réservées à
// `authenticated` : aucune ne prend d'identifiant de boutique en paramètre — le lien, l'artisan et
// la boutique sont retrouvés à partir du compte connecté.

import { useQuery } from '@tanstack/react-query'
import { lireBons, lireEtat, type BonEspace, type EtatEspace } from './espace-boutique'
import { supabase } from './supabase'

export type CompteBoutique =
  | { ok: true; nom: string; email: string; fournisseurs: number }
  | { ok: false; erreur: string }

/**
 * « Suis-je un compte de boutique, et laquelle ? » — la question que se pose l'app juste après la
 * connexion. Un compte artisan reçoit `pas_un_compte_boutique` et continue sa route ; ce n'est pas
 * une erreur, c'est une réponse.
 */
export function useMonCompteBoutique(actif = true) {
  return useQuery({
    queryKey: ['compte-boutique'],
    enabled: actif,
    // Cette ligne ne change que par une décision d'administration (le rattachement du compte au
    // lien) : la relire à chaque navigation n'apprendrait rien.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CompteBoutique> => {
      const { data, error } = await supabase.rpc('mon_compte_boutique')
      if (error) throw error
      const o = (data ?? {}) as Record<string, unknown>
      if (o.erreur) return { ok: false, erreur: String(o.erreur) }
      return {
        ok: true,
        nom: String(o.nom ?? ''),
        email: String(o.email ?? ''),
        fournisseurs: Number(o.fournisseurs ?? 0),
      }
    },
  })
}

export type ResultatEspace = { etat: EtatEspace | null; erreur: string | null }

/** Tout ce que la boutique voit : ses artisans, leurs pièces, leurs bons à confirmer. */
export function useEspaceBoutique() {
  return useQuery({
    queryKey: ['espace-boutique'],
    queryFn: async (): Promise<ResultatEspace> => lireEtat(await rpc('boutique_compte_etat', {})),
  })
}

/** Les dépôts d'un artisan, un par un — confirmés ou pas. */
export function useEspaceBons(partenaireId: string | undefined) {
  return useQuery({
    queryKey: ['espace-bons', partenaireId],
    enabled: Boolean(partenaireId),
    queryFn: async (): Promise<BonEspace[]> => {
      const reponse = await rpc('boutique_compte_bons', { partenaire_param: partenaireId })
      const { bons, erreur } = lireBons(reponse)
      if (erreur) throw new Error(erreur)
      return bons
    },
  })
}

async function rpc(nom: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(nom, args)
  if (error) throw error
  return data
}
