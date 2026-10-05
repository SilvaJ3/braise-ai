import { describe, expect, it } from 'vitest'
import assistant from '../../supabase/functions/assistant/index.ts?raw'
import importer from '../../supabase/functions/import/index.ts?raw'

// Ces deux fonctions réservent des jetons dans l'enveloppe du mois AVANT l'appel au modèle. Le quota
// horaire doit passer en premier : sinon chaque requête refusée par ce plafond garde sa réserve, et un
// compte qui insiste vide son enveloppe sans qu'aucun appel n'ait eu lieu (audit du 05/10/2026, M3).
// Les fonctions edge n'ont pas de harnais d'exécution : on garde l'ordre en lisant la source.
const avant = (source: string, quota: string, reservation: string) => {
  const q = source.indexOf(quota)
  const r = source.indexOf(reservation)
  return { q, r }
}

describe('quota horaire AVANT la réservation de jetons', () => {
  it('assistant (tour de chat)', () => {
    const { q, r } = avant(assistant, "p_kind: 'chat'", 'reserverJetons(admin, userId')
    expect(q).toBeGreaterThan(-1)
    expect(r).toBeGreaterThan(-1)
    expect(q).toBeLessThan(r)
  })

  it('import', () => {
    const { q, r } = avant(importer, "p_kind: 'import'", 'reserverJetons(admin, userData.user.id')
    expect(q).toBeGreaterThan(-1)
    expect(r).toBeGreaterThan(-1)
    expect(q).toBeLessThan(r)
  })

  it('assistant : la réserve revient quand le tour ne peut pas démarrer ou que le bilan échoue', () => {
    // création de la réponse impossible + panne du bilan (deux chemins, deux remboursements)
    expect(assistant.match(/corrigerJetons\(admin, userId, reserve, CONSOMMATION_VIDE\)/g)?.length).toBe(2)
  })
})
