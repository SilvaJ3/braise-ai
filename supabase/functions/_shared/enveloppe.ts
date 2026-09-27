// L'enveloppe du mois : le plafond de l'assistant, exprimé en « jetons équivalents entrée ».
//
// Pourquoi plus un nombre de questions. Un tour de chat enchaîne plusieurs appels au modèle
// (outils, reprise après `pause_turn`) et un import de fichier peut sortir 16 000 jetons : deux
// « 1 » du même compteur valaient donc des choses très différentes, et le plafond ne bornait pas
// la facture du fournisseur. L'unité retenue est le **jeton équivalent entrée** — ce que l'usage a
// réellement coûté, ramené au tarif d'un jeton d'entrée. C'est la seule unité où une question de
// chat, un bilan et un import se comparent honnêtement.
//
// Les pondérations sont DÉRIVÉES du tarif du fournisseur (`PRIX_USD_PAR_MTOK`) et non écrites en
// dur : le jour où la grille change, l'enveloppe et le coût affiché bougent ensemble. Un jeton de
// sortie vaut 5 jetons d'entrée parce qu'il coûte 5 fois plus, pas parce que 5 a été choisi.
//
// Ce que l'enveloppe ne compte pas : les recherches web, facturées à la pièce (10 $ / 1000) et
// bornées par les garde-fous horaires. Rien dans le tarif par million de jetons ne donne leur
// poids — les inventer ici serait un nombre magique de plus.

import { PRIX_USD_PAR_MTOK, planValide, type Consommation, type Plan } from './compte.ts'

/**
 * Poids d'un jeton de chaque poste, en jetons d'entrée. Le poste d'entrée vaut 1 par construction :
 * tout le reste s'exprime par rapport à lui.
 */
export const POIDS_JETON = {
  input: 1,
  output: PRIX_USD_PAR_MTOK.output / PRIX_USD_PAR_MTOK.input,
  cacheRead: PRIX_USD_PAR_MTOK.cacheRead / PRIX_USD_PAR_MTOK.input,
  cacheWrite: PRIX_USD_PAR_MTOK.cacheWrite / PRIX_USD_PAR_MTOK.input,
} as const

/** Ce que le compte a droit chaque mois, par plan. Les formules payantes ont la même enveloppe. */
export const ENVELOPPE_JETONS: Record<Plan, number> = {
  // Un essai doit suffire à juger l'outil, pas à s'en servir un mois entier à l'œil.
  essai: 400_000,
  fondateur: 1_500_000,
  mensuel: 1_500_000,
  annuel: 1_500_000,
}

/** Un nombre utilisable : non fini ou négatif compte pour zéro (jamais NaN dans un compteur). */
const sur = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** L'enveloppe du mois d'un plan. Un plan inconnu retombe sur l'essai, comme partout ailleurs. */
export function enveloppeJetons(plan: unknown): number {
  return ENVELOPPE_JETONS[planValide(plan)]
}

/**
 * Le plafond du mois : l'enveloppe du plan, plus les jetons achetés. C'est ce nombre que la base
 * reçoit en `p_max` quand elle réserve — elle ne connaît pas la règle des plans, le code la lui
 * donne, comme pour les quotas de questions avant.
 */
export function plafondJetons(plan: unknown, credits: number | null | undefined = 0): number {
  return enveloppeJetons(plan) + Math.round(sur(credits))
}

/** Ce qu'une consommation a coûté, en jetons équivalents entrée. */
export function jetonsEquivalents(c: Consommation): number {
  const brut =
    sur(c?.input_tokens) * POIDS_JETON.input +
    sur(c?.output_tokens) * POIDS_JETON.output +
    sur(c?.cache_read_tokens) * POIDS_JETON.cacheRead +
    sur(c?.cache_write_tokens) * POIDS_JETON.cacheWrite
  return Math.round(brut)
}

/**
 * Combien de questions cela représente, en ordre de grandeur — jamais un engagement. Sert à écrire
 * « environ 300 questions » à côté d'un plafond qui, lui, se compte en jetons : personne ne sait
 * lire 1 500 000 jetons, tout le monde sait lire 300 questions.
 */
export const JETONS_PAR_QUESTION = 5_000

export function questionsIndicatives(jetons: number | null | undefined): number {
  return Math.round(sur(jetons) / JETONS_PAR_QUESTION)
}

/**
 * Ce qu'on réserve AVANT d'appeler le modèle. Ce n'est pas un chiffrage, c'est un à-valoir : la
 * réservation est ramenée sur la consommation réelle juste après l'appel (`corriger_jetons_mois`),
 * et le plafond ne se referme jamais sur un compte avant que le coût soit engagé.
 *
 * L'import réserve le plafond de sortie de l'extraction (16 000 jetons, comptés 5x) parce que c'est
 * ce qu'un fichier peut coûter au maximum, sans son entrée. Le chat réserve un tour ordinaire.
 */
const MAX_SORTIE_IMPORT = 16_000

export const RESERVE_JETONS = {
  assistant: 5_000,
  import: Math.ceil(MAX_SORTIE_IMPORT * POIDS_JETON.output),
} as const

export type SoldeJetons = {
  enveloppe: number
  credits: number
  consommes: number
  /** Ce qui reste à consommer, enveloppe et crédits confondus. */
  restant: number
  /** Part du restant qui vient de l'enveloppe du mois (elle se consomme en premier). */
  restantEnveloppe: number
  /** Part du restant qui vient des jetons achetés. */
  restantCredits: number
  /** Plus rien à consommer : l'écran le dit, et les appels seront refusés. */
  epuise: boolean
}

/**
 * Où en est le compte ce mois-ci. L'ordre de consommation est celui du produit : l'enveloppe du
 * mois d'abord, les jetons achetés ensuite — un pack n'est entamé que quand ce qui était inclus a
 * été utilisé, sinon on ferait payer à un artisan ce qu'il avait déjà.
 */
export function soldeJetons(
  plan: unknown,
  consommes: number | null | undefined,
  credits: number | null | undefined = 0,
): SoldeJetons {
  const enveloppe = enveloppeJetons(plan)
  const c = Math.round(sur(consommes))
  const cr = Math.round(sur(credits))
  const restantEnveloppe = Math.max(0, enveloppe - c)
  const restantCredits = Math.max(0, cr - Math.max(0, c - enveloppe))
  const restant = restantEnveloppe + restantCredits
  return { enveloppe, credits: cr, consommes: c, restant, restantEnveloppe, restantCredits, epuise: restant <= 0 }
}

/**
 * La règle que la base applique avant de réserver, relue ici pour l'écran et pour les tests.
 * La décision qui compte reste celle de `consommer_jetons_mois` (atomique) ; celle-ci sert à dire
 * les choses avant, pas à autoriser après.
 */
export function enveloppeDisponible(
  plan: unknown,
  consommes: number | null | undefined,
  credits: number | null | undefined,
  reserve: number,
): boolean {
  return Math.round(sur(consommes)) + Math.round(sur(reserve)) <= plafondJetons(plan, credits)
}

/**
 * Le message d'un plafond épuisé, prêt à afficher — il dit l'ordre de grandeur en questions, quand
 * ça se recharge, et par où on peut aller plus loin. Le ton est celui du produit : on explique, on
 * ne gronde pas, et on ne promet pas d'accès.
 */
export function messageEnveloppeEpuisee(jetons: number | null | undefined, achetable = true): string {
  const questions = questionsIndicatives(jetons)
  const ordre = questions > 0 ? `environ ${questions} question${questions > 1 ? 's' : ''}` : 'ce qu’il contenait'
  const base = `Tu as utilisé tout ce que ton mois comprend (${ordre}) : ça se recharge le 1er du mois prochain.`
  return achetable
    ? `${base} En attendant, tu peux prendre un pack de jetons depuis ton compte.`
    : base
}

/**
 * Les deux chiffres de l'enveloppe tels que la base les rend, ou `null` quand elle ne les connaît
 * pas encore (migration 0069 pas appliquée).
 *
 * L'écran a besoin de cette distinction : sans elle, il afficherait un plafond de zéro sur une base
 * en retard, c'est-à-dire un compte bloqué qui n'en est pas un. Le repli est donc explicite — les
 * anciens compteurs de questions — et non un écran vide.
 */
export function champsEnveloppe(data: unknown): { consommes: number; credits: number } | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { jetons_consommes?: unknown; credits_jetons?: unknown }
  if (d.jetons_consommes === undefined || d.jetons_consommes === null) return null
  const consommes = Number(d.jetons_consommes)
  if (!Number.isFinite(consommes)) return null
  const credits = Number(d.credits_jetons ?? 0)
  return { consommes, credits: Number.isFinite(credits) ? credits : 0 }
}
