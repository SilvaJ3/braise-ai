// La partie réseau de l'enveloppe : réserver avant un appel, corriger après.
//
// Le module reste séparé du reste (`enveloppe.ts`) pour deux raisons : `enveloppe.ts` est importé
// par l'écran et ne doit donc dépendre de rien, et les deux fonctions qui consomment des jetons
// (assistant, import) doivent appliquer EXACTEMENT la même règle — deux implémentations qui
// divergent, c'est un plafond qui fuit d'un côté.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { enveloppeJetons, jetonsEquivalents, messageEnveloppeEpuisee } from './enveloppe.ts'
import type { Consommation } from './compte.ts'

/**
 * Ce que la réservation a décidé :
 *  · `reserve` — la place est prise, l'appel peut partir ;
 *  · `refus` — il n'y a plus de quoi payer un tour, avec le message à afficher ;
 *  · `indisponible` — la base ne connaît pas encore l'enveloppe (migration 0069 non appliquée).
 *    L'appelant retombe alors sur l'ancien plafond plutôt que de refuser un artisan à cause d'un
 *    déploiement en avance sur la base.
 */
export type Reservation =
  | { etat: 'reserve'; reserve: number }
  | { etat: 'refus'; message: string }
  | { etat: 'indisponible' }

/** Les jetons achetés et non encore consommés, tous packs confondus. Un pack ne périme pas. */
export async function creditsJetons(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin.from('credits_jetons').select('jetons').eq('user_id', userId)
  // Une lecture impossible compte pour zéro : mieux vaut un plafond un peu plus serré que large.
  if (error) return 0
  return (data ?? []).reduce(
    (total, ligne) => total + Number((ligne as { jetons?: number | string | null }).jetons ?? 0),
    0,
  )
}

/**
 * Réserve la place d'un tour dans l'enveloppe du mois. L'incrément est atomique en base
 * (`consommer_jetons_mois`) : deux tours simultanés ne peuvent pas lire le même compteur.
 *
 * Comme pour l'ancien quota de questions, un refus a quand même fait monter le compteur : on
 * réserve, puis on compare. Le coût réel n'est pas engagé — aucun appel au modèle n'a lieu — et un
 * compteur légèrement au-dessus du plafond ne change rien à ce qui s'affiche, qui borne le reste
 * à zéro.
 */
export async function reserverJetons(
  admin: SupabaseClient,
  userId: string,
  plan: unknown,
  reserve: number,
): Promise<Reservation> {
  const credits = await creditsJetons(admin, userId)
  const enveloppe = enveloppeJetons(plan)

  const { data, error } = await admin.rpc('consommer_jetons_mois', {
    p_user: userId,
    p_jetons: reserve,
    p_max: enveloppe + credits,
  })
  if (error) {
    console.error('[enveloppe] réservation indisponible', error)
    return { etat: 'indisponible' }
  }
  if (data === false) {
    return { etat: 'refus', message: messageEnveloppeEpuisee(enveloppe + credits) }
  }
  return { etat: 'reserve', reserve }
}

/**
 * Ramène le compteur du mois sur la consommation réelle : la réservation n'était qu'un à-valoir.
 * Un échec de correction ne casse rien — il est journalisé, et le compteur reste alors celui de la
 * réservation, donc jamais plus permissif que la réalité.
 */
export async function corrigerJetons(
  admin: SupabaseClient,
  userId: string,
  reserve: number | null,
  conso: Consommation,
): Promise<void> {
  if (reserve == null) return
  const delta = jetonsEquivalents(conso) - Math.round(reserve)
  if (delta === 0) return
  const { error } = await admin.rpc('corriger_jetons_mois', { p_user: userId, p_delta: delta })
  if (error) console.error('[enveloppe] correction', error)
}
