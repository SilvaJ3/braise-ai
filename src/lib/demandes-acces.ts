// L'écran « Demandes d'accès » — ce qui se décide sans réseau.
//
// Ce module ne connaît ni React ni Supabase : il range la liste, choisit les libellés et traduit
// la réponse de l'edge function `demande-acces`. Les appels vivent dans `profil.ts`, comme pour
// l'abonnement.
//
// Deux idées portent l'écran :
//  - une demande « nouvelle » porte encore son **jeton** : c'est la capacité d'agir, exactement
//    celle du lien reçu par mail. Une demande traitée n'en a plus, donc plus rien à cliquer ;
//  - la validation n'est **pas rejouable** — le serveur répond `deja_traitee` — et l'écran le dit
//    sans le présenter comme une panne.
//
// Le geste lui-même n'est pas réécrit ici : valider passe par l'edge function, seul chemin qui sait
// créer l'invitation nominative, appliquer le plafond des places de fondateur et envoyer le lien.

import type { ResultatValidation } from '../../supabase/functions/_shared/demande-acces'

export type StatutDemande = 'nouvelle' | 'validee' | 'refusee'

/** Une ligne de `demandes_acces`, telle que l'écran d'administration la reçoit. */
export type DemandeAcces = {
  id: string
  email: string
  atelier: string | null
  message: string | null
  statut: string
  jeton: string | null
  created_at: string
  traitee_at: string | null
  invitation_code: string | null
}

export type ActionDemande = 'valider' | 'refuser'

/** Un statut inconnu (valeur absente, colonne non lue) compte pour « à traiter », jamais pour un refus. */
export function statutDemande(v: unknown): StatutDemande {
  return v === 'validee' || v === 'refusee' ? v : 'nouvelle'
}

/** Ce qu'il reste à décider, de la plus ancienne à la plus récente : on répond dans l'ordre reçu. */
export function demandesATraiter(liste: DemandeAcces[]): DemandeAcces[] {
  return liste
    .filter((d) => statutDemande(d.statut) === 'nouvelle')
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

/** Ce qui a déjà été décidé, la plus récente d'abord : c'est un journal, pas une file d'attente. */
export function demandesTraitees(liste: DemandeAcces[]): DemandeAcces[] {
  return liste
    .filter((d) => statutDemande(d.statut) !== 'nouvelle')
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/**
 * Peut-on agir sur cette demande ? Il faut qu'elle soit encore à traiter **et** qu'elle porte son
 * jeton : une ligne sans jeton (jeton effacé par le serveur) ne doit pas proposer un bouton qui
 * échouerait.
 */
export function peutAgir(d: DemandeAcces): boolean {
  return statutDemande(d.statut) === 'nouvelle' && typeof d.jeton === 'string' && d.jeton.length > 0
}

/** Le mot affiché à côté d'une demande. */
export function libelleStatut(statut: unknown): string {
  switch (statutDemande(statut)) {
    case 'validee':
      return 'Invitation envoyée'
    case 'refusee':
      return 'Refusée'
    default:
      return 'À traiter'
  }
}

/** Une date ISO écrite pour être lue (« 19 septembre 2026 »), ou null si elle est inutilisable. */
export function dateDemande(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Ce qui identifie une demande en une ligne : l'atelier quand il est donné, l'adresse sinon. */
export function resumeDemande(d: DemandeAcces): string {
  const atelier = (d.atelier ?? '').trim()
  return atelier || d.email
}

/** Le mot du haut : ce qu'il reste à faire, en clair, sans flatterie. */
export function resumeListe(liste: DemandeAcces[]): string {
  const aTraiter = demandesATraiter(liste).length
  if (aTraiter === 0) return 'Aucune demande en attente.'
  return aTraiter === 1 ? '1 demande en attente.' : `${aTraiter} demandes en attente.`
}

export type ResultatAffiche = { ton: 'ok' | 'info' | 'erreur'; texte: string }

/**
 * Traduire la réponse du serveur. Les cas viennent du serveur, pas de l'écran (`ResultatValidation`) :
 * une demande déjà traitée n'est pas une erreur — c'est le signe que le lien du mail a servi ou
 * qu'un autre onglet est passé avant.
 */
export function resultatTraitement(cas: ResultatValidation['cas'] | string, email?: string): ResultatAffiche {
  const qui = email ? ` à ${email}` : ''
  switch (cas) {
    case 'validee':
      return { ton: 'ok', texte: `Invitation envoyée${qui}. La personne a reçu son lien d'inscription.` }
    case 'refusee':
      return { ton: 'info', texte: `Demande refusée${qui}. Aucun mail n'a été envoyé.` }
    case 'deja_traitee':
      return { ton: 'info', texte: 'Cette demande avait déjà été traitée : rien n’a été renvoyé.' }
    case 'jeton_inconnu':
      return { ton: 'erreur', texte: 'Cette demande n’est plus retrouvable — recharge la liste.' }
    default:
      return { ton: 'erreur', texte: 'Ça n’est pas passé. Réessaie dans un instant.' }
  }
}

/** Le libellé du bouton, avec ce qu'il déclenche écrit dessus. */
export function libelleAction(action: ActionDemande): string {
  return action === 'valider' ? 'Valider et inviter' : 'Refuser'
}
