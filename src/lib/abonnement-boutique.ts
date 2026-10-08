// L'abonnement de la BOUTIQUE côté écran : quel statut afficher, que dire de l'accès offert, ce que
// l'écran propose. Module PUR (ni réseau ni client Supabase), testable : il lit ce que rend la
// fonction `mon_abonnement_boutique()` (migration 0082) et rien d'autre.
//
// Règle posée par JSB (03/10) : le LIEN de la boutique reste une porte sans compte et sans abonnement.
// Rien ici ne ferme le lien ; `accesCompte` ne parle que des fonctions réservées au compte connecté,
// et aucun écran ne s'en sert encore pour bloquer quoi que ce soit.
//
// Aucun prix n'est écrit ici : l'offre vit dans Stripe, la base porte ce qui est réellement prélevé.

import { finEssaiPourAccesOffert } from '../../supabase/functions/_shared/stripe-boutique'
import { dateLisible } from './abonnement'

export type StatutBoutique = 'aucun' | 'offert' | 'actif' | 'en_retard' | 'resilie'

const STATUTS: StatutBoutique[] = ['aucun', 'offert', 'actif', 'en_retard', 'resilie']

/** Un statut inconnu (valeur absente, colonne non lue) compte pour « aucun » : il ne s'affiche jamais tel quel. */
export function statutBoutique(v: unknown): StatutBoutique {
  return STATUTS.find((s) => s === v) ?? 'aucun'
}

/** Ce que rend `mon_abonnement_boutique()` quand `ok` est vrai (dates en `YYYY-MM-DD`). */
export type LigneAbonnementBoutique = {
  statut?: unknown
  acces_offert_jusqu_au?: string | null
  fin?: string | null
  annule?: boolean | null
}

/**
 * Ce que rend la base, ramené à une ligne utilisable, ou null : une réponse d'erreur (`non_connecte`,
 * `pas_un_compte_boutique`) ou illisible n'est pas un abonnement, et l'écran n'a alors rien à dire.
 */
export function lireAbonnementBoutique(brut: unknown): LigneAbonnementBoutique | null {
  if (typeof brut !== 'object' || brut === null) return null
  const o = brut as Record<string, unknown>
  if (o.erreur || o.ok !== true) return null
  return {
    statut: o.statut,
    acces_offert_jusqu_au: typeof o.acces_offert_jusqu_au === 'string' ? o.acces_offert_jusqu_au : null,
    fin: typeof o.fin === 'string' ? o.fin : null,
    annule: o.annule === true,
  }
}

/**
 * Les boutons « S'abonner » et « Gérer » sont-ils ouverts ? Interrupteur de build (`VITE_PAIEMENT_BOUTIQUE=oui`),
 * ÉTEINT par défaut : tant que les fonctions de paiement ne sont pas déployées, un bouton qui échouerait
 * serait un geste annoncé et non livré. On l'allume le jour du déploiement, pas avant.
 */
export function paiementBoutiqueOuvert(valeur: unknown): boolean {
  return valeur === 'oui'
}

/** Ce que Stripe a laissé dans l'adresse au retour de la page de paiement (`?paiement=…`), ou null. */
export function messageRetourPaiementBoutique(param: string | null | undefined): { ton: 'ok' | 'info'; texte: string } | null {
  switch (param) {
    case 'ok':
      return { ton: 'ok', texte: 'Paiement reçu. Ton abonnement s’active — ça peut prendre quelques secondes avant de s’afficher ici.' }
    case 'offert':
      return {
        ton: 'ok',
        texte: 'Abonnement enregistré. Tes jours offerts sont gardés : rien n’est prélevé avant la fin de ton accès offert.',
      }
    case 'annule':
      return { ton: 'info', texte: 'Paiement annulé : rien n’a été prélevé.' }
    default:
      return null
  }
}

/**
 * Ce que dit l'écran à une boutique en accès offert qui s'abonne : garde-t-elle ses jours offerts ? Oui si
 * l'accès dure encore assez longtemps pour que Stripe accepte de reporter le premier prélèvement (48 h) ;
 * sinon l'abonnement démarre tout de suite, et on le dit AVANT qu'elle ne clique. Rien pour les autres statuts.
 */
export function phraseAbonnerPendantOffert(ligne: LigneAbonnementBoutique | null | undefined, maintenant: Date = new Date()): string | null {
  if (statutBoutique(ligne?.statut) !== 'offert' || !pasPassee(ligne?.acces_offert_jusqu_au, maintenant)) return null
  const date = dateLisible(ligne?.acces_offert_jusqu_au)
  return finEssaiPourAccesOffert(ligne?.acces_offert_jusqu_au, maintenant) !== null
    ? `Si tu t’abonnes maintenant, tu gardes tes jours offerts : le premier prélèvement n’a lieu qu’après le ${date}.`
    : `Ton accès offert se termine le ${date} : si tu t’abonnes maintenant, l’abonnement démarre tout de suite.`
}

/**
 * Le prix de l'abonnement boutique, en clair. Décision de JSB du 07/10/2026 : la boutique voit ce
 * qu'elle paie AVANT de cliquer (jusqu'ici le prix n'apparaissait que sur la page Stripe — c'est là
 * qu'on la perdait). Les prix Stripe live disent la même chose : 4 900 et 49 000 centimes.
 */
export const PRIX_BOUTIQUE = {
  mensuel: '49 € HTVA par mois',
  annuel: '490 € HTVA par an, engagement de douze mois',
} as const

export function prixBoutique(frequence: 'mensuel' | 'annuel'): string {
  return frequence === 'annuel' ? PRIX_BOUTIQUE.annuel : PRIX_BOUTIQUE.mensuel
}

export type EtatBoutique = {
  statut: StatutBoutique
  badge: string
  phrase: string
  /** La date qui compte pour ce statut (fin de l'accès offert ou de la période), écrite pour une boutique. */
  date: string | null
  /** Les fonctions du compte connecté sont-elles ouvertes ? Le lien, lui, ne dépend jamais de ceci. */
  accesCompte: boolean
  peutSouscrire: boolean
  /** Ouvrir le portail Stripe (carte, factures, résiliation). */
  peutGerer: boolean
}

/** Aujourd'hui au format `YYYY-MM-DD`, comme la colonne `date` de la base (jour inclus, comme `>= current_date`). */
const jour = (d: Date) => d.toISOString().slice(0, 10)

/** Une date `YYYY-MM-DD` qui n'est pas passée ; une valeur illisible ne compte pas comme future. */
function pasPassee(iso: string | null | undefined, maintenant: Date): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(iso ?? '') && iso!.slice(0, 10) >= jour(maintenant)
}

export function etatAbonnementBoutique(
  ligne: LigneAbonnementBoutique | null | undefined,
  maintenant: Date = new Date(),
): EtatBoutique {
  const statut = statutBoutique(ligne?.statut)
  const offertJusqua = ligne?.acces_offert_jusqu_au ?? null
  const fin = ligne?.fin ?? null
  const finDevant = pasPassee(fin, maintenant)

  // Résiliation programmée : elle passe avant le statut de paiement (Stripe garde « actif » jusqu'au bout).
  if (ligne?.annule === true && (statut === 'actif' || statut === 'en_retard')) {
    return {
      statut,
      badge: 'Résiliation programmée',
      phrase: finDevant
        ? `Tu as résilié : l’abonnement reste actif jusqu’au ${dateLisible(fin)}, puis plus rien ne sera prélevé.`
        : 'L’abonnement est terminé : plus rien ne sera prélevé.',
      date: dateLisible(fin),
      accesCompte: finDevant,
      peutSouscrire: !finDevant,
      peutGerer: true,
    }
  }

  switch (statut) {
    case 'offert': {
      const encore = pasPassee(offertJusqua, maintenant)
      const date = dateLisible(offertJusqua)
      return encore
        ? {
            statut,
            badge: 'Accès offert',
            phrase: `Accès offert jusqu’au ${date}. Rien n’est prélevé sans ton accord.`,
            date,
            accesCompte: true,
            peutSouscrire: true,
            peutGerer: false,
          }
        : {
            statut,
            badge: 'Accès offert terminé',
            phrase: `L’accès offert s’est terminé${date ? ` le ${date}` : ''}. Ton lien de boutique continue de fonctionner ; abonne-toi quand tu veux garder le compte.`,
            date,
            accesCompte: false,
            peutSouscrire: true,
            peutGerer: false,
          }
    }
    case 'actif':
      return {
        statut,
        badge: 'Actif',
        phrase: finDevant ? `Abonnement en cours. Prochain prélèvement le ${dateLisible(fin)}.` : 'Abonnement en cours.',
        date: dateLisible(fin),
        accesCompte: true,
        peutSouscrire: false,
        peutGerer: true,
      }
    case 'en_retard':
      return {
        statut,
        badge: 'En retard',
        phrase: 'Un prélèvement a échoué. Stripe relance tout seul pendant quelques jours ; mets ta carte à jour si le problème vient d’elle.',
        date: dateLisible(fin),
        accesCompte: true, // comme côté artisan : un retard de prélèvement ne coupe rien
        peutSouscrire: false,
        peutGerer: true,
      }
    case 'resilie':
      return {
        statut,
        badge: 'Terminé',
        phrase: finDevant ? `Abonnement résilié : il reste actif jusqu’au ${dateLisible(fin)}.` : 'Abonnement terminé : plus rien n’est prélevé.',
        date: dateLisible(fin),
        accesCompte: finDevant,
        peutSouscrire: true,
        peutGerer: true,
      }
    default:
      return {
        statut: 'aucun',
        badge: 'Aucun',
        phrase: 'Pas d’abonnement : rien n’est prélevé, et ton lien de boutique fonctionne comme avant.',
        date: null,
        accesCompte: false,
        peutSouscrire: true,
        peutGerer: false,
      }
  }
}
