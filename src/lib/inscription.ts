import { supabase } from './supabase'
import { functionErrorMessage } from './push'

/**
 * Crée un compte à partir d'un code d'invitation.
 *
 * L'inscription publique est désactivée sur le projet : c'est le seul chemin vers un compte, et
 * le code est vérifié côté serveur (l'edge function `inscription`). Le front ne fait que
 * présenter les erreurs qu'elle renvoie.
 */
export async function creerCompte(valeurs: {
  code: string
  email: string
  password: string
}): Promise<{ plan: string }> {
  const { data, error } = await supabase.functions.invoke('inscription', { body: valeurs })
  if (error) throw new Error(await functionErrorMessage(error))
  const corps = data as { error?: string; plan?: string } | null
  if (corps?.error) throw new Error(corps.error)
  return { plan: corps?.plan ?? 'fondateur' }
}
