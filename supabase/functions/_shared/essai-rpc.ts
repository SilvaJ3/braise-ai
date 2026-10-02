// La partie réseau de l'essai : lire ce qui décide de l'accès d'un compte.
//
// Séparé de `essai.ts` comme `enveloppe-rpc.ts` l'est de `enveloppe.ts` : le module de règle est
// importé par l'écran et ne doit dépendre de rien. Le quota d'essai a UNE implémentation, partagée
// par les deux fonctions qui consomment des jetons (assistant, import) — deux copies divergeraient.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { accesAutorise, messageAccesRefuse, type EtatAcces } from './essai.ts'

/** Ce que la fonction appelante doit faire : laisser passer, ou refuser avec la phrase. */
export type DecisionAcces = { autorise: true } | { autorise: false; message: string }

/**
 * Lit l'état d'accès du compte et tranche.
 *
 * Une lecture impossible laisse passer, et le journal le dit : la seule raison de ne pas pouvoir
 * lire ces trois colonnes est que la base est en retard sur le code (colonne pas encore créée),
 * et fermer l'assistant à tout le monde à cause d'un déploiement serait la pire des pannes. À
 * l'inverse, un refus se journalise aussi — c'est la trace de ce qu'un artisan a vu.
 */
export async function accesDuCompte(admin: SupabaseClient, userId: string): Promise<DecisionAcces> {
  const { data, error } = await admin
    .from('assistant_profil')
    .select('essai_fin, abonnement_statut, est_test, acces_gratuit, acces_ferme_le')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[essai] accès illisible — laissé passer', error)
    return { autorise: true }
  }
  const etat = (data ?? null) as EtatAcces | null
  if (accesAutorise(etat)) return { autorise: true }
  // La phrase dépend de la CAUSE de la fermeture (jamais commencé, essai fini, impayé) : une seule
  // phrase pour trois situations ferait dire à l'app quelque chose de faux dans deux cas sur trois.
  console.log('[essai] accès refusé pour ce compte', userId)
  return { autorise: false, message: messageAccesRefuse(etat) }
}
