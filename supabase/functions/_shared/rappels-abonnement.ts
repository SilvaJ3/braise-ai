// Ce que le cron de l'abonnement doit faire aujourd'hui : les décisions, isolées de l'envoi.
//
// Trois envois possibles et une fermeture, décidés ici et exécutés ailleurs :
//   · le rappel d'essai, deux jours avant la fin puis la veille ;
//   · la relance après un prélèvement refusé, trois au maximum, espacées de trois jours ;
//   · la fermeture de l'accès, une semaine après la dernière relance restée sans réponse ;
//   · l'avis de reconduction de l'abonnement à l'année, quinze jours avant.
//
// Pourquoi ce fichier existe, séparé de la fonction edge : ces règles se vérifient sans base, sans
// réseau et sans horloge (voir le test). Une règle d'envoi écrite directement dans la requête SQL
// finit par décider autre chose que ce qu'on croit — c'est exactement l'erreur qui a fait partir une
// relance le même jour que la précédente, côté boutiques.
//
// Ce que chaque action porte : la trace à écrire APRÈS l'envoi. Une action annoncée n'est pas une
// action faite : le cron écrit la date seulement quand le mail est parti, sans quoi une panne de
// Resend laisserait croire que la personne a été prévenue.

import {
  avisRenouvellementAEnvoyer,
  essaiEnCours,
  fermetureDue,
  rappelEssaiDuJour,
  relanceImpayeAEnvoyer,
} from './essai.ts'

/** Les colonnes du compte dont la décision a besoin. Toutes facultatives : rien n'est deviné. */
export type CompteAbonnement = {
  user_id: string
  email?: string | null
  essai_fin?: string | null
  essai_rappel_j2_le?: string | null
  essai_rappel_j1_le?: string | null
  abonnement_statut?: string | null
  abonnement_annule?: boolean | null
  abonnement_frequence?: string | null
  abonnement_fin?: string | null
  abonnement_prix_centimes?: number | null
  renouvellement_avis_le?: string | null
  impaye_relances?: number | null
  impaye_relance_le?: string | null
  acces_ferme_le?: string | null
}

/** Ce qui doit se passer pour un compte : un envoi, ou la fermeture. */
export type Action =
  | { type: 'essai'; compte: CompteAbonnement; jours: number; finLe: string }
  | { type: 'impaye'; compte: CompteAbonnement; relance: number }
  | { type: 'fermeture'; compte: CompteAbonnement }
  | { type: 'renouvellement'; compte: CompteAbonnement; finLe: string }

/**
 * Les actions du jour, dans l'ordre où elles se lisent.
 *
 * Un compte peut n'avoir qu'une action à la fois, sauf cas tordu (un impayé pendant l'essai, ce qui
 * n'arrive pas) : les trois blocs s'excluent par leurs propres conditions, et le tri final n'est là
 * que pour rendre le journal lisible.
 */
export function actionsDuJour(
  lignes: readonly CompteAbonnement[],
  maintenant: Date = new Date(),
): Action[] {
  const actions: Action[] = []

  for (const c of lignes) {
    const enEssai = essaiEnCours(c.essai_fin, maintenant)
    const statut = c.abonnement_statut ?? 'aucun'
    const annule = c.abonnement_annule === true
    const relances = typeof c.impaye_relances === 'number' && c.impaye_relances > 0 ? c.impaye_relances : 0

    // 1. L'essai : seulement sur un abonnement vivant ET non annulé. Quelqu'un qui a déjà dit non
    //    n'a pas à recevoir « ton essai se termine et voici ce qui va être prélevé » : il ne sera
    //    pas prélevé, et ce mail-là serait faux.
    if (enEssai && statut === 'actif' && !annule) {
      const rappel = rappelEssaiDuJour(c.essai_fin, maintenant)
      if (rappel && c.essai_fin) {
        const dejaFait = rappel === 'j-2' ? c.essai_rappel_j2_le : c.essai_rappel_j1_le
        if (!dejaFait) {
          actions.push({ type: 'essai', compte: c, jours: rappel === 'j-2' ? 2 : 1, finLe: c.essai_fin })
        }
      }
    }

    // 2. L'impayé : relance tant qu'il en reste, puis fermeture une semaine après la dernière.
    //    La fermeture ne passe jamais avant la dernière relance — on ne ferme pas sans avoir
    //    prévenu quelqu'un qui a peut-être simplement changé de carte.
    if (statut === 'en_retard' && !c.acces_ferme_le) {
      if (relanceImpayeAEnvoyer(relances, c.impaye_relance_le, maintenant)) {
        actions.push({ type: 'impaye', compte: c, relance: relances + 1 })
      } else if (fermetureDue(relances, c.impaye_relance_le, maintenant)) {
        actions.push({ type: 'fermeture', compte: c })
      }
    }

    // 3. La reconduction de l'annuel. Jamais pendant l'essai : à ce moment-là, la date de fin de
    //    période EST la fin de l'essai, et « ton abonnement se renouvelle » serait déjà dit par le
    //    rappel d'essai, avec le bon montant.
    const dejaAvis = c.renouvellement_avis_le !== null && c.renouvellement_avis_le !== undefined
    if (
      !enEssai &&
      c.abonnement_fin &&
      avisRenouvellementAEnvoyer(
        c.abonnement_fin,
        c.abonnement_frequence,
        annule,
        dejaAvis,
        maintenant,
      )
    ) {
      actions.push({ type: 'renouvellement', compte: c, finLe: c.abonnement_fin })
    }
  }

  return actions
}

/**
 * Ce qu'il faut écrire sur le compte quand l'action a réussi — la ou les colonnes, et leur valeur.
 * Rendu ici plutôt qu'au moment de l'écriture : c'est la même table que celle qui a décidé, et deux
 * listes de colonnes finiraient par ne plus se correspondre.
 *
 * Deux actions écrivent plus d'une colonne : une relance compte aussi son numéro, sinon la
 * deuxième relance repartirait le lendemain de la première.
 *
 * Une `fermeture` n'envoie aucun mail : sa trace EST `acces_ferme_le`, posée au même moment sur le
 * compte. Le reste se date après l'envoi — une action annoncée n'est pas une action faite, et une
 * panne de Resend ne doit pas laisser croire que la personne a été prévenue.
 */
export function majDeLaction(action: Action, quand: Date): Record<string, string | number> | null {
  const iso = quand.toISOString()
  switch (action.type) {
    case 'essai':
      return action.jours === 2 ? { essai_rappel_j2_le: iso } : { essai_rappel_j1_le: iso }
    case 'impaye':
      return { impaye_relances: action.relance, impaye_relance_le: iso }
    case 'renouvellement':
      return { renouvellement_avis_le: iso }
    case 'fermeture':
      return { acces_ferme_le: iso }
    default:
      return null
  }
}
