// Les packs de jetons : un paiement UNIQUE, pas un abonnement.
//
// Module PUR : il ne parle ni à Stripe ni à Supabase, et c'est ce qui permet de vérifier sans clé
// ce qui doit être juste — quels packs existent, combien de jetons chacun donne, et à quelles
// conditions un événement Stripe a le droit de créditer un compte.
//
// Ce que le moment du crédit doit garantir, et qui se lit ici :
//   · un événement qui ne nous concerne pas ne crédite RIEN (session d'abonnement, pack inconnu,
//     paiement non abouti, compte non identifié) ;
//   · le nombre de jetons n'est JAMAIS lu dans les métadonnées de la session : il vient de la
//     table ci-dessous. Une métadonnée se fabrique avec une clé d'écriture ; le montant crédité,
//     lui, se décide ici.
//
// Montants HTVA : Braaise facture la TVA belge en sus (21 %), et en autoliquidation pour les
// clients professionnels hors Belgique — d'où `automatic_tax` et `tax_id_collection` côté Stripe.

import { JETONS_PAR_QUESTION } from './enveloppe.ts'

export type PackId = 'pack_30' | 'pack_50'

export type Pack = {
  /** Ce qui est encaissé, en centimes, hors TVA. */
  centimes: number
  /** Ce que le pack ajoute à l'enveloppe. */
  jetons: number
  /** Le titre court, pour le bouton. */
  titre: string
  /** La ligne de détail : le prix, les jetons, et l'ordre de grandeur en questions. */
  libelle: string
}

const pack = (centimes: number, jetons: number): Pack => ({
  centimes,
  jetons,
  titre: `${centimes / 100} € de jetons`,
  libelle: `${centimes / 100} € — ${jetons.toLocaleString('fr-BE')} jetons (environ ${
    Math.round(jetons / JETONS_PAR_QUESTION)
  } questions)`,
})

export const PACKS: Record<PackId, Pack> = {
  pack_30: pack(3_000, 3_000_000),
  pack_50: pack(5_000, 6_000_000),
}

export const PACK_IDS: PackId[] = ['pack_30', 'pack_50']

/** Un identifiant de pack venu du client : inconnu = null, jamais un pack par défaut. */
export function packValide(v: unknown): PackId | null {
  return typeof v === 'string' && v in PACKS ? (v as PackId) : null
}

/** Les deux identifiants de prix des packs, lus dans les secrets : jamais écrits en dur. */
export type IdentifiantsPacks = {
  pack30: string
  pack50: string
}

export function prixPack(p: PackId, ids: IdentifiantsPacks): string {
  return p === 'pack_30' ? ids.pack30 : ids.pack50
}

export function montantPack(p: PackId): string {
  return `${PACKS[p].centimes / 100} €`
}

/** Les métadonnées posées sur la session de paiement d'un pack. */
export function metadonneesPack(userId: string, p: PackId): Record<string, string> {
  return { user_id: userId, pack: p, jetons: String(PACKS[p].jetons) }
}

/** Un identifiant de compte Supabase : un uuid, sinon on ne sait pas à qui créditer. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Les champs d'une session Stripe dont le crédit a besoin — forme minimale, donc testable. */
export type SessionPaiement = {
  id?: string | null
  mode?: string | null
  payment_status?: string | null
  client_reference_id?: string | null
  metadata?: Record<string, string> | null
}

export type CreditPack = {
  /** Le compte à créditer. */
  userId: string
  pack: PackId
  jetons: number
  /** La source, telle qu'elle s'écrit dans `credits_jetons`. */
  source: PackId
  /** L'identifiant de session Stripe : la clef d'idempotence du crédit. */
  sessionId: string
}

/**
 * Ce qu'un événement Stripe a le droit de créditer, ou `null` si ce n'est pas un de nos achats.
 *
 * Un événement écouté en trop n'est pas une erreur : c'est le cas ordinaire quand la même URL de
 * webhook sert l'abonnement et les packs. Ce qui serait grave, c'est d'en créditer un.
 */
export function creditDepuisSession(session: SessionPaiement | null | undefined): CreditPack | null {
  if (!session) return null
  // Une session d'abonnement n'est pas un achat de jetons.
  if (session.mode !== 'payment') return null
  // Un paiement qui n'est pas encaissé ne crédite rien (méthodes asynchrones : le second événement
  // arrive plus tard, c'est lui qui crédite).
  if (session.payment_status !== 'paid') return null
  if (!session.id) return null

  const p = packValide(session.metadata?.pack)
  if (!p) return null

  const userId = session.client_reference_id ?? ''
  if (!UUID.test(userId)) return null

  // Les deux porteurs de l'identité du compte doivent dire la même chose : un désaccord signifie
  // qu'on ne sait pas à qui créditer, donc on ne crédite personne.
  const dansMetadonnees = session.metadata?.user_id
  if (dansMetadonnees && dansMetadonnees !== userId) return null

  return { userId, pack: p, jetons: PACKS[p].jetons, source: p, sessionId: session.id }
}

/**
 * La clef d'idempotence : l'identifiant de session, unique sur `credits_jetons`. Un événement
 * rejoué porte la même clef, donc l'insertion en base est un non-événement — la garantie dure est
 * l'index unique, pas une relecture côté code.
 */
export function clefCredit(c: CreditPack): string {
  return c.sessionId
}
