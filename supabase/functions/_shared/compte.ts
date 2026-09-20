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
  fondateur: { label: 'Fondateur', questions: 150, imports: 20, prix: '29 €/mois HTVA — 2 ans' },
  mensuel: { label: 'Mensuel', questions: 150, imports: 20, prix: '39 €/mois HTVA' },
  annuel: { label: 'Annuel', questions: 150, imports: 20, prix: '390 €/an HTVA' },
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
// — 2 $ / 10 $, écriture de cache 2,50 $, relecture de cache 0,20 $. À remettre à jour si le
// modèle ou le tarif change : c'est la seule ligne à toucher.
const PRIX_USD_PAR_MTOK = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 }
// Taux figé, volontairement : afficher un coût en euros qui bouge à chaque variation du change
// n'aiderait personne à décider. On peut le corriger d'un seul endroit.
const EUR_PAR_USD = 0.92

/** Un nombre de jetons utilisable : non fini ou négatif compte pour zéro (jamais NaN). */
const jetonsSur = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0)

/**
 * Coût estimé d'un usage, en euros. Arrondi à 4 décimales (le centime n'a pas de sens ici).
 *
 * `inputTokens` ne compte que les jetons facturés plein tarif : chez Anthropic, les jetons relus
 * dans le cache et ceux écrits dans le cache sont comptés séparément, à 0,1x et 1,25x le tarif
 * d'entrée. Les additionner surestimerait la facture d'un facteur ~10 sur la partie relue — d'où
 * quatre paramètres au lieu de deux.
 */
export function coutEstimeEur(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const usd =
    (jetonsSur(inputTokens) / 1_000_000) * PRIX_USD_PAR_MTOK.input +
    (jetonsSur(outputTokens) / 1_000_000) * PRIX_USD_PAR_MTOK.output +
    (jetonsSur(cacheReadTokens) / 1_000_000) * PRIX_USD_PAR_MTOK.cacheRead +
    (jetonsSur(cacheWriteTokens) / 1_000_000) * PRIX_USD_PAR_MTOK.cacheWrite
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
  /** Jetons relus dans le cache du fournisseur (facturés ~0,1x l'entrée). */
  cache_read_tokens: number
  /** Jetons écrits dans le cache (facturés ~1,25x l'entrée). */
  cache_write_tokens: number
  /** Recherches de l'outil web facturées à la pièce, hors jetons. */
  recherches_web: number
  appels: number
  /** Répartition par usage (chat, bilan, import) : ce que le total ne dit pas. */
  detail: UsageParFonction[]
  mois: string
  /** Où en est le **paiement** (0049) — une autre question que le plan, qui dit à quoi on a droit. */
  abonnement_statut: 'aucun' | 'actif' | 'en_retard' | 'resilie'
  /** Fin de la période en cours, écrite par `stripe-webhook` (null = jamais rien payé). */
  abonnement_fin: string | null
  /** Ce qui est réellement prélevé, remise déduite, en centimes (null = inconnu). */
  abonnement_prix_centimes: number | null
}

/** Une ligne du détail mensuel : quel usage, quelle quantité. */
export type UsageParFonction = {
  fonction: FonctionLlm
  appels: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  recherches_web: number
}

export const FONCTION_LABEL: Record<FonctionLlm, string> = {
  assistant: 'Assistant (chat)',
  bilan: 'Bilan hebdo',
  import: 'Import de fichiers',
  autre: 'Autre',
}

export type FonctionLlm = 'assistant' | 'bilan' | 'import' | 'autre'

/**
 * Ce qu'un appel — ou une suite d'appels — a consommé. Une seule forme pour tout le journal : les
 * fonctions qui parlent au modèle n'ont pas à connaître le nom des colonnes.
 *
 * `recherches_web` compte les recherches exécutées côté Anthropic par l'outil web : elles sont
 * facturées à part (10 $ / 1000) et n'apparaissent dans aucun compteur de jetons.
 */
export type Consommation = {
  appels: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  recherches_web: number
}

export const CONSOMMATION_VIDE: Consommation = {
  appels: 0,
  input_tokens: 0,
  output_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  recherches_web: 0,
}

/** Usage brut de l'API Anthropic : tous les champs sont facultatifs et absents comptent pour zéro. */
export type UsageBrut = {
  input_tokens?: number
  output_tokens?: number
  /** Jetons écrits dans le cache (facturés 1,25x l'entrée). */
  cache_creation_input_tokens?: number
  /** Jetons relus dans le cache (facturés 0,1x l'entrée). */
  cache_read_input_tokens?: number
  server_tool_use?: { web_search_requests?: number } | null
}

/** Traduit l'usage d'une réponse en consommation journalisable. Pure, donc testée. */
export function consommation(usage: UsageBrut | null | undefined, appels = 1): Consommation {
  return {
    appels: Math.max(0, Math.round(appels)),
    input_tokens: jetonsSur(usage?.input_tokens ?? 0),
    output_tokens: jetonsSur(usage?.output_tokens ?? 0),
    cache_read_tokens: jetonsSur(usage?.cache_read_input_tokens ?? 0),
    cache_write_tokens: jetonsSur(usage?.cache_creation_input_tokens ?? 0),
    recherches_web: jetonsSur(usage?.server_tool_use?.web_search_requests ?? 0),
  }
}

const somme = (a: number, b: number): number => a + b

/** Additionne deux consommations : un tour de chat enchaîne plusieurs appels au modèle. */
export function cumuler(a: Consommation, b: Consommation): Consommation {
  return {
    appels: somme(a.appels, b.appels),
    input_tokens: somme(a.input_tokens, b.input_tokens),
    output_tokens: somme(a.output_tokens, b.output_tokens),
    cache_read_tokens: somme(a.cache_read_tokens, b.cache_read_tokens),
    cache_write_tokens: somme(a.cache_write_tokens, b.cache_write_tokens),
    recherches_web: somme(a.recherches_web, b.recherches_web),
  }
}

/** Coût d'une consommation en euros (mêmes tarifs et même taux que `coutEstimeEur`). */
export function coutConsommation(c: Consommation): number {
  return coutEstimeEur(c.input_tokens, c.output_tokens, c.cache_read_tokens, c.cache_write_tokens)
}

/**
 * Ce que le cache a évité de payer, en euros : la partie relue facturée plein tarif, moins ce
 * qu'elle a réellement coûté. C'est le chiffre qui dit si le cache travaille — un cache qui ne
 * produit aucune économie signifie que le préfixe change trop souvent pour être relu.
 */
export function economieCache(c: Consommation): number {
  const pleinTarif = coutEstimeEur(c.cache_read_tokens, 0)
  const relu = coutEstimeEur(0, 0, c.cache_read_tokens)
  return Math.round((pleinTarif - relu) * 10_000) / 10_000
}

/**
 * Ligne à insérer dans `usage_llm`. La construction est pure (donc testable) ; l'insertion se
 * fait dans l'edge function, avec son client service_role.
 */
export function ligneUsage(
  userId: string,
  fonction: FonctionLlm,
  modele: string,
  c: Consommation,
): {
  user_id: string
  fonction: FonctionLlm
  modele: string
  appels: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  recherches_web: number
} {
  return {
    user_id: userId,
    fonction,
    modele: modele.slice(0, 60),
    appels: Math.max(1, Math.round(c.appels)),
    input_tokens: Math.max(0, Math.round(c.input_tokens) || 0),
    output_tokens: Math.max(0, Math.round(c.output_tokens) || 0),
    cache_read_tokens: Math.max(0, Math.round(c.cache_read_tokens) || 0),
    cache_write_tokens: Math.max(0, Math.round(c.cache_write_tokens) || 0),
    recherches_web: Math.max(0, Math.round(c.recherches_web) || 0),
  }
}
