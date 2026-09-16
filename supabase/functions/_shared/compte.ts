// Plans, quotas et coût du modèle : module PUR, partagé par l'edge function et l'interface.
//
// C'est la seule source de vérité des quotas par défaut. La colonne `quota_mensuel` de
// `assistant_profil` n'existe que pour déroger ponctuellement (dépannage, geste commercial).
// La contrainte `assistant_profil_plan_valide` en base reprend la même liste de plans : les deux
// doivent rester alignés.

export type Plan = 'essai' | 'fondateur' | 'mensuel' | 'annuel'

export const PLANS: Record<Plan, { label: string; questions: number; imports: number; prix: string | null }> = {
  // Un essai doit suffire à juger l'outil, pas à s'en servir un mois entier à l'œil.
  essai: { label: 'Essai', questions: 40, imports: 3, prix: null },
  fondateur: { label: 'Fondateur', questions: 150, imports: 20, prix: '19 €/mois à vie' },
  mensuel: { label: 'Mensuel', questions: 150, imports: 20, prix: '29 €/mois' },
  annuel: { label: 'Annuel', questions: 150, imports: 20, prix: '290 €/an' },
}

export function planValide(v: unknown): Plan {
  return typeof v === 'string' && v in PLANS ? (v as Plan) : 'essai'
}

/** Quota effectif : la dérogation du compte si elle existe, sinon celle du plan. */
export function quotaQuestions(plan: unknown, derogation?: number | null): number {
  if (typeof derogation === 'number' && derogation > 0) return derogation
  return PLANS[planValide(plan)].questions
}

export function quotaImports(plan: unknown, derogation?: number | null): number {
  if (typeof derogation === 'number' && derogation > 0) return derogation
  return PLANS[planValide(plan)].imports
}

// Tarif du modèle, en dollars par million de tokens. Source : grille Anthropic de `claude-sonnet-5`
// ($2 / $10). À remettre à jour si le modèle ou le tarif change — c'est la seule ligne à toucher.
const PRIX_USD_PAR_MTOK = { input: 2, output: 10 }
// Taux figé, volontairement : afficher un coût en euros qui bouge à chaque variation du change
// n'aiderait personne à décider. On peut le corriger d'un seul endroit.
const EUR_PAR_USD = 0.92

/** Un nombre de jetons utilisable : non fini ou négatif compte pour zéro (jamais NaN). */
const jetonsSur = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0)

/** Coût estimé d'un usage, en euros. Arrondi à 4 décimales (le centime n'a pas de sens ici). */
export function coutEstimeEur(inputTokens: number, outputTokens: number): number {
  const usd =
    (jetonsSur(inputTokens) / 1_000_000) * PRIX_USD_PAR_MTOK.input +
    (jetonsSur(outputTokens) / 1_000_000) * PRIX_USD_PAR_MTOK.output
  return Math.round(usd * EUR_PAR_USD * 10_000) / 10_000
}

/** Message d'un quota atteint, prêt à afficher — il dit toujours quand ça se recharge. */
export function messageQuotaAtteint(quoi: 'questions' | 'imports', quota: number): string {
  const recharge = 'le 1er du mois prochain'
  if (quoi === 'questions') {
    return quota === 1
      ? `Tu as utilisé ta question du mois : elle se recharge ${recharge}. Dis-le si tu en veux plus.`
      : `Tu as utilisé tes ${quota} questions du mois : elles se rechargent ${recharge}. Dis-le si tu en veux plus.`
  }
  return quota === 1
    ? `Tu as utilisé ton import du mois : il se recharge ${recharge}. Dis-le si tu en veux plus.`
    : `Tu as utilisé tes ${quota} imports du mois : ils se rechargent ${recharge}. Dis-le si tu en veux plus.`
}

export type UsageMois = {
  plan: Plan
  /** Dérogation du compte, ou null : le quota effectif vient du plan (voir quotaQuestions). */
  quota_derogation: number | null
  questions_utilisees: number
  imports_utilises: number
  input_tokens: number
  output_tokens: number
  appels: number
  mois: string
}

export type FonctionLlm = 'assistant' | 'bilan' | 'import' | 'autre'

/**
 * Ligne à insérer dans `usage_llm`. La construction est pure (donc testable) ; l'insertion se
 * fait dans l'edge function, avec son client service_role.
 */
export function ligneUsage(
  userId: string,
  fonction: FonctionLlm,
  modele: string,
  appels: number,
  inputTokens: number,
  outputTokens: number,
): {
  user_id: string
  fonction: FonctionLlm
  modele: string
  appels: number
  input_tokens: number
  output_tokens: number
} {
  return {
    user_id: userId,
    fonction,
    modele: modele.slice(0, 60),
    appels: Math.max(1, Math.round(appels)),
    input_tokens: Math.max(0, Math.round(inputTokens) || 0),
    output_tokens: Math.max(0, Math.round(outputTokens) || 0),
  }
}
