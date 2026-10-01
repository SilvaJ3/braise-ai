// Qui utilise Braaise gratuitement (0076) : ce que l'écran d'administration montre, décidé sans
// réseau. Module PUR, donc testable — la table de vérité des accès se lit ici, pas dans un JSX.
//
// Ce que l'écran doit rendre évident : **pourquoi** un compte a accès. Quatre raisons existent et
// elles ne se confondent pas — l'accès offert (décision nominative, la seule que l'écran change),
// le compte de test, l'abonnement qui paie, l'essai en cours. Un compte fermé le dit aussi, sans
// détour : c'est la liste de ceux à qui l'outil ne répond plus.

import { accesDuCompteAffiche } from './abonnement'
import {
  ESSAI_JOURS,
  abonnementOuvreAcces,
  essaiEnCours,
  joursEssaiRestants,
} from '../../supabase/functions/_shared/essai'

/** Une ligne de `comptes_admin()` (0076) : ce qui décide de l'accès d'un compte. */
export type CompteAdmin = {
  user_id: string
  email: string | null
  plan: string | null
  abonnement_statut: string | null
  essai_fin: string | null
  acces_gratuit: boolean
  acces_gratuit_depuis: string | null
  est_test: boolean
  ouvert_le: string | null
}

export type EtatCompteAffiche = {
  /** L'outil répond-il à ce compte ? (la même règle que le serveur) */
  ouvert: boolean
  /** Le mot du badge : « Offert », « Abonné », « Essai — 3 j », « Fermé »… */
  badge: string
  /** La phrase qui explique l'accès, ou son absence. */
  phrase: string
  /** Ce compte est-il déjà offert ? (ce que le bouton propose de retirer) */
  offert: boolean
  /** Le bouton a-t-il un sens ? Un compte de test est ouvert de toute façon. */
  basculable: boolean
}

/** La date courte d'un compte, ou null : une valeur illisible ne s'affiche pas. */
export function dateCompte(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * L'état d'un compte, dans l'ordre où les raisons se décident (le même que `accesAutorise`) :
 * offert, compte de test, abonnement, puis essai. L'ordre compte — un fondateur qui paie et dont
 * l'essai est fini doit se lire « Abonné », pas « essai terminé ».
 */
export function etatCompte(c: CompteAdmin, maintenant: Date = new Date()): EtatCompteAffiche {
  const ouvert = accesDuCompteAffiche(c, maintenant)
  const depuis = dateCompte(c.acces_gratuit_depuis)
  const basculable = !c.est_test

  if (c.acces_gratuit) {
    return {
      ouvert: true,
      badge: 'Offert',
      phrase: depuis ? `Accès offert — depuis le ${depuis}. Rien n’est prélevé.` : 'Accès offert — rien n’est prélevé.',
      offert: true,
      basculable,
    }
  }

  if (c.est_test) {
    return {
      ouvert: true,
      badge: 'Compte de test',
      phrase: 'Compte de démonstration : il garde l’accès quoi qu’il arrive, et rien n’est facturé.',
      offert: false,
      basculable: false,
    }
  }

  if (abonnementOuvreAcces(c.abonnement_statut)) {
    return {
      ouvert: true,
      badge: c.abonnement_statut === 'en_retard' ? 'Abonné — en retard' : 'Abonné',
      phrase:
        c.abonnement_statut === 'en_retard'
          ? 'Un prélèvement a échoué : Stripe relance, et l’accès reste ouvert.'
          : 'Abonnement en cours : l’accès est payé.',
      offert: false,
      basculable,
    }
  }

  if (essaiEnCours(c.essai_fin, maintenant)) {
    const jours = joursEssaiRestants(c.essai_fin, maintenant)
    return {
      ouvert: true,
      badge: `Essai — ${jours} j`,
      phrase: `Essai en cours : il reste ${jours} jour${jours > 1 ? 's' : ''} sur les ${ESSAI_JOURS}.`,
      offert: false,
      basculable,
    }
  }

  return {
    ouvert,
    badge: 'Fermé',
    phrase:
      'Essai terminé et rien d’ouvert : l’assistant et les imports ne répondent plus. Ouvrir l’accès ici les remet en marche.',
    offert: false,
    basculable,
  }
}

/** Le libellé du bouton : ce qu'il fera, écrit au présent de l'action. */
export function libelleBascule(c: CompteAdmin): string {
  return c.acces_gratuit ? 'Retirer l’accès offert' : 'Offrir l’accès'
}

/** Un compte lisible dans une liste : le nom de la boutique s'il existe, sinon l'adresse. */
export function nomCompte(c: CompteAdmin): string {
  return c.email ?? c.user_id.slice(0, 8)
}

/** Le résumé de la liste, en une phrase — ce que l'administrateur veut savoir d'un coup d'œil. */
export function resumeComptes(comptes: CompteAdmin[], maintenant: Date = new Date()): string {
  if (comptes.length === 0) return 'Aucun compte à afficher.'
  const offerts = comptes.filter((c) => c.acces_gratuit).length
  const fermes = comptes.filter((c) => !etatCompte(c, maintenant).ouvert).length
  const morceaux = [
    `${comptes.length} compte${comptes.length > 1 ? 's' : ''}`,
    `${offerts} offert${offerts > 1 ? 's' : ''}`,
  ]
  if (fermes > 0) morceaux.push(`${fermes} sans accès`)
  return `${morceaux.join(' · ')}.`
}
