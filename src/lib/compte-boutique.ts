// Les appels de l'espace de la boutique connectée — les seuls endroits qui parlent au réseau pour
// cet espace. Les formes et les calculs vivent dans `lib/espace-boutique.ts` (pur, testable).
//
// Trois fonctions de la base (migration 0067), toutes `security definer` et réservées à
// `authenticated` : aucune ne prend d'identifiant de boutique en paramètre — le lien, l'artisan et
// la boutique sont retrouvés à partir du compte connecté.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { lireAbonnementBoutique, type LigneAbonnementBoutique } from './abonnement-boutique'
import { lireBons, lireEtat, messageEspace, type BonEspace, type EtatEspace } from './espace-boutique'
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

/**
 * L'abonnement de la boutique connectée (migration 0082), ou null s'il n'y a rien à montrer. Une
 * erreur — notamment la fonction pas encore en base — vaut « rien à montrer » : l'espace ne doit
 * jamais casser, ni laisser voir un lien vers un écran vide, pour une fonction qui n'existe pas encore.
 */
export function useMonAbonnementBoutique() {
  return useQuery({
    queryKey: ['abonnement-boutique'],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LigneAbonnementBoutique | null> => {
      const { data, error } = await supabase.rpc('mon_abonnement_boutique')
      return error ? null : lireAbonnementBoutique(data)
    },
  })
}

export type ResultatEspace ={ etat: EtatEspace | null; erreur: string | null }

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

/**
 * Ce que rend un geste : `ok`, ou le code d'erreur de la base, traduit en une phrase. Les fonctions
 * du lien rendent leurs refus en `jsonb` (`erreur`) et **pas** en erreur HTTP : sans cette
 * traduction, un refus passerait pour un succès — l'écran dirait « c'est fait » sur un geste que la
 * base a jeté.
 */
function reponseGeste(brut: unknown): void {
  const o = (brut ?? {}) as Record<string, unknown>
  // La traduction vit dans `espace-boutique.ts` (testée sans réseau) : une seule table de messages.
  if (o.erreur) throw new Error(messageEspace(String(o.erreur)))
}

/** Les écrans qui lisent l'espace, remis à jour après un geste : l'état, et les bons de chacun. */
function useRafraichirEspace() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: ['espace-boutique'] })
    void client.invalidateQueries({ queryKey: ['espace-bons'] })
  }
}

/** Confirmer la réception d'un bon : c'est ce geste qui fait entrer les pièces dans le stock. */
export function useConfirmerBon() {
  const rafraichir = useRafraichirEspace()
  return useMutation({
    mutationFn: async (bonId: string) => {
      reponseGeste(await rpc('boutique_compte_confirmer_bon', { bon_param: bonId }))
    },
    onSuccess: rafraichir,
  })
}

/**
 * Signaler un écart sur un bon (« ce bon ne correspond pas »). Une trace datée pour l'artisan : le bon
 * ne change pas. Passé 3 jours après le dépôt, la base accepte encore : c'est l'écran de l'artisan qui
 * marque le signalement « tardif » (lib/contestation.ts). Envoyé deux fois, le même texte ne crée qu'une trace.
 */
export function useContesterBon() {
  return useMutation({
    mutationFn: async (params: { bonId: string; message: string }) => {
      reponseGeste(await rpc('boutique_compte_contester_bon', { bon_param: params.bonId, message_param: params.message }))
    },
  })
}

/**
 * Demander un réassort :la demande devient une commande ordinaire chez l'artisan, à ses statuts.
 * Les lignes portent la clé d'une pièce, jamais un libellé saisi — la résolution est dans la base.
 */
export function useCommanderReassort() {
  const rafraichir = useRafraichirEspace()
  return useMutation({
    mutationFn: async (params: {
      partenaireId: string
      lignes: { cle: string; quantite: number }[]
      note?: string
    }) => {
      reponseGeste(
        await rpc('boutique_compte_commander', {
          partenaire_param: params.partenaireId,
          lignes_param: params.lignes,
          note_param: params.note ?? null,
        }),
      )
    },
    onSuccess: rafraichir,
  })
}
