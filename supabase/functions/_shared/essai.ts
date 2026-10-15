// L'essai de sept jours : la règle du produit, écrite une seule fois.
//
// Braaise s'essaie sept jours, puis s'abonne. Ce fichier ne parle à personne et n'importe rien de
// réseau : il dit quand un compte a le droit de travailler, ce qu'on lit à un artisan dont l'accès
// est fermé, et quand un rappel doit partir. Le serveur refuse un tour d'assistant, un import ou un
// nouveau bon avec cette règle ; l'écran l'annonce avec la même — deux implémentations
// divergeraient au premier changement.
//
// Décision de JSB (14/10/2026), qui remplace celle du 02/10 : l'essai de sept jours **s'ouvre à la
// première vraie action**, sans carte (0091). Un compte neuf qui devait donner sa carte avant
// d'avoir vu l'outil se voyait refuser son premier import. Le compte neuf travaille donc tout de
// suite ; l'essai commence au premier aha (un produit enregistré, un bon, un post validé ou publié,
// un message à l'assistant) et la carte se demande avant la fin, pas avant le début. Deux rappels
// partent avant la fin — deux jours avant, puis la veille. Un essai ouvert avec la carte (Checkout)
// reste possible pour qui la donne avant son premier aha.
//
// Ce que l'accès fermé NE ferme pas : les données. Dépôts déjà émis, planning, stock, boutiques,
// page de la boutique restent lisibles. Ce qui s'arrête, c'est le travail : l'assistant, les
// imports, et l'émission d'un nouveau bon de dépôt. C'est ce qui distingue un compte fermé d'un
// compte perdu — et c'est aussi ce qui laisse une raison de revenir.

/** La durée de l'essai, en jours. La seule ligne à changer si la règle change. */
export const ESSAI_JOURS = 7

/**
 * Un compte qui n'atteint jamais son premier aha voit son essai s'ouvrir d'office après ce délai
 * (0091, décision du 14/10/2026) : au plus ESSAI_OUVERT_D_OFFICE_APRES_JOURS + ESSAI_JOURS jours
 * d'accès sans payer, depuis l'ouverture du compte.
 */
export const ESSAI_OUVERT_D_OFFICE_APRES_JOURS = 7

const MS_JOUR = 86_400_000

/** L'essai se rappelle deux jours avant la fin, puis la veille : les deux seuls envois. */
export const RAPPELS_ESSAI_JOURS = [2, 1] as const

/** Trois relances après un prélèvement refusé, espacées de trois jours, puis la porte se ferme. */
export const RELANCES_IMPAYE_MAX = 3
export const JOURS_ENTRE_RELANCES = 3
/** Le délai laissé après la dernière relance avant de fermer. */
export const JOURS_AVANT_FERMETURE = 7

/**
 * L'avis de reconduction de l'abonnement annuel : au plus tard 15 jours avant la date limite pour
 * s'y opposer (art. VI.91 CDE et l'information préalable que la loi belge impose). Le mensuel sans
 * engagement n'est pas concerné : rien ne se reconduit sans qu'on l'ait dit.
 */
export const JOURS_AVIS_RENOUVELLEMENT = 15

/** Ce qui décide de l'accès d'un compte. Tous les champs sont facultatifs : rien n'est deviné. */
export type EtatAcces = {
  /** Fin de l'essai (ISO). Absente = la base ne la connaît pas (voir `accesAutorise`). */
  essai_fin?: string | null
  /** Statut de paiement écrit par `stripe-webhook` : aucun / actif / en_retard / resilie. */
  abonnement_statut?: string | null
  /** Compte de test (un testeur, futur utilisateur) : aucune conséquence, donc aucune porte. */
  est_test?: boolean | null
  /**
   * Compte de démonstration : l'outil qu'on montre à quelqu'un. Aucune porte non plus, et — à la
   * différence du compte de test — aucun de ses envois ne part vers un tiers (`demo.ts`).
   */
  demo?: boolean | null
  /** Accès offert par l'administrateur (0076) : rien n'est prélevé, la porte reste ouverte. */
  acces_gratuit?: boolean | null
  /**
   * La fermeture décidée par l'application (0077) : trois relances restées sans paiement. Elle se
   * lit SÉPARÉMENT du statut Stripe — `en_retard` laisse travailler, cette date-là ferme — pour
   * qu'une facture finalement payée rouvre la porte sans qu'on ait menti sur l'état du paiement.
   */
  acces_ferme_le?: string | null
}

/** Une date utilisable, ou null : une valeur illisible ne compte pas comme une date. */
function dateFin(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** L'essai court-il encore ? Une date absente ou illisible ne compte pas comme un essai en cours. */
export function essaiEnCours(essaiFin: string | null | undefined, maintenant: Date = new Date()): boolean {
  const fin = dateFin(essaiFin)
  return fin !== null && fin.getTime() > maintenant.getTime()
}

/**
 * Les jours d'essai restants, arrondis au jour supérieur : un essai qui finit dans deux heures
 * affiche « 1 jour », pas « 0 » — le jour en cours n'est pas terminé.
 */
export function joursEssaiRestants(essaiFin: string | null | undefined, maintenant: Date = new Date()): number {
  const fin = dateFin(essaiFin)
  if (!fin) return 0
  const reste = fin.getTime() - maintenant.getTime()
  return reste <= 0 ? 0 : Math.ceil(reste / MS_JOUR)
}

/**
 * Le rappel d'essai qui doit partir aujourd'hui, ou `null`.
 *
 * Le cron passe une fois par jour, et l'arrondi au jour supérieur fait que « deux jours restants »
 * couvre la journée entière qui précède les 48 dernières heures : chaque rappel tombe donc une fois,
 * et une seule. C'est la même fonction qui décide pour les deux envois — un cron qui rattrape après
 * une panne enverra le bon, jamais les deux.
 */
export function rappelEssaiDuJour(
  essaiFin: string | null | undefined,
  maintenant: Date = new Date(),
): 'j-2' | 'j-1' | null {
  const jours = joursEssaiRestants(essaiFin, maintenant)
  if (jours === RAPPELS_ESSAI_JOURS[0]) return 'j-2'
  if (jours === RAPPELS_ESSAI_JOURS[1]) return 'j-1'
  return null
}

/**
 * Le paiement ouvre l'accès. `en_retard` aussi : un prélèvement qui a échoué est un problème de
 * carte, pas une raison de fermer l'outil à quelqu'un qui travaille (décision du 20/09, tenue ici).
 */
export function abonnementOuvreAcces(statut: unknown): boolean {
  return statut === 'actif' || statut === 'en_retard'
}

/**
 * Le compte peut-il travailler ?
 *
 *  · un compte de test passe toujours (il n'a aucune conséquence), et un compte de démonstration
 *    aussi ;
 *  · un accès offert passe aussi, et c'est une décision nominative de l'administrateur (0076) ;
 *  · la fermeture décidée par l'application passe AVANT le statut de paiement : trois relances
 *    restées sans réponse ferment la porte, et c'est tout l'objet de la colonne ;
 *  · un abonnement actif ou en retard ouvre l'accès ;
 *  · sinon, c'est l'essai qui décide.
 *
 * Une date d'essai absente ouvre l'accès, et c'est voulu depuis 0091 : l'essai n'a pas encore
 * commencé, le compte travaille pour atteindre son premier aha. C'est aussi le bon réflexe si la
 * colonne est illisible : fermer l'outil à quelqu'un sur une colonne vide serait pire que laisser
 * travailler un compte.
 */
export function accesAutorise(etat: EtatAcces | null | undefined, maintenant: Date = new Date()): boolean {
  if (etat?.est_test) return true
  if (etat?.demo) return true
  if (etat?.acces_gratuit) return true
  if (etat?.acces_ferme_le) return false
  if (abonnementOuvreAcces(etat?.abonnement_statut)) return true
  const fin = dateFin(etat?.essai_fin)
  if (!fin) return true
  return fin.getTime() > maintenant.getTime()
}

/**
 * Ce que lit l'artisan à qui l'assistant, un import ou un nouveau bon est refusé. La phrase dit les
 * trois choses utiles : ce qui s'est arrêté, ce qui n'est PAS perdu, et par où repartir.
 */
export function messageEssaiTermine(): string {
  return `Tes ${ESSAI_JOURS} jours d'essai sont terminés : l'assistant, les imports et les nouveaux bons de dépôt sont en pause. Tes dépôts, ton planning et tes données sont toujours là, en lecture. Prends ton abonnement depuis « Mon compte » pour repartir.`
}

/**
 * Le compte n'a pas encore commencé son essai — c'est l'état d'un compte neuf depuis le 14/10/2026 :
 * les sept jours s'ouvrent à la première vraie action. La phrase dit quoi faire pour commencer, et
 * qu'il n'y a rien à régler avant.
 */
export function messageEssaiPasCommence(): string {
  return `Tes ${ESSAI_JOURS} jours d'essai commencent à ta première action : importer tes produits, préparer un bon de dépôt, valider un post ou poser une question à l'assistant. Rien à régler avant.`
}

/** La phrase du refus après trois relances : ce qui a été tenté, et ce qu'une régularisation rouvre. */
export function messageImpaye(): string {
  return `Ton abonnement n'a pas pu être prélevé après trois relances : l'assistant, les imports et les nouveaux bons sont en pause. Tes dépôts, ton planning et tes données sont toujours là, en lecture — régularise depuis « Mon compte » et tout repart.`
}

/**
 * La phrase du refus, choisie sur l'état RÉEL du compte. Deux causes, deux phrases : un essai
 * terminé (l'abonnement le rouvre), une fermeture après relances (une facture le rouvre). Un compte
 * dont l'essai n'a pas commencé n'est jamais refusé (`accesAutorise`). Une seule implémentation, lue
 * par le serveur ET par l'écran.
 */
export function messageAccesRefuse(etat: EtatAcces | null | undefined): string {
  if (etat?.acces_ferme_le) return messageImpaye()
  return messageEssaiTermine()
}

/** Marge sous laquelle Stripe refuse une fin d'essai fixée à la main : au moins 48 h dans le futur. */
const MARGE_FIN_ESSAI_STRIPE_MS = 49 * 3_600_000

/**
 * Ce que le Checkout doit dire de l'essai, pour qu'une carte donnée en cours d'essai ne rouvre pas
 * sept jours de plus :
 *  · un compte qui a déjà eu un abonnement paie tout de suite ;
 *  · l'essai n'a pas commencé : sept jours, ouverts avec la carte ;
 *  · l'essai court encore, avec de la marge : il se poursuit jusqu'à SA date (`trial_end`), la carte
 *    n'ajoute rien ;
 *  · l'essai est fini, ou il reste trop peu pour que Stripe l'accepte : paiement immédiat.
 */
export function essaiPourCheckout(
  essaiFin: string | null | undefined,
  aDejaUnAbonnement: boolean,
  maintenant: Date = new Date(),
): { trial_period_days: number } | { trial_end: number } | null {
  if (aDejaUnAbonnement) return null
  const fin = dateFin(essaiFin)
  if (!fin) return { trial_period_days: ESSAI_JOURS }
  if (fin.getTime() - maintenant.getTime() >= MARGE_FIN_ESSAI_STRIPE_MS) {
    return { trial_end: Math.floor(fin.getTime() / 1000) }
  }
  return null
}

/**
 * Une relance d'impayé doit-elle partir aujourd'hui ?
 *
 * Trois envois au maximum, espacés de trois jours. C'est la fonction qui décide, pas la requête du
 * cron : une requête qui interroge des dates finit par décider autre chose que ce qu'on croit, et la
 * relance part alors le même jour que la précédente.
 */
export function relanceImpayeAEnvoyer(
  relances: number | null | undefined,
  derniereRelanceLe: string | null | undefined,
  maintenant: Date = new Date(),
): boolean {
  const faites = typeof relances === 'number' && relances > 0 ? relances : 0
  if (faites >= RELANCES_IMPAYE_MAX) return false
  if (faites === 0) return true
  const derniere = dateFin(derniereRelanceLe)
  // Une relance faite sans date lisible vaut « jamais relancé » : mieux vaut un mail de trop qu'un
  // artisan laissé sans nouvelles avant qu'on lui ferme son outil.
  if (!derniere) return true
  return maintenant.getTime() - derniere.getTime() >= JOURS_ENTRE_RELANCES * MS_JOUR
}

/** La porte doit-elle se fermer ? Après la dernière relance, on laisse une semaine pour réagir. */
export function fermetureDue(
  relances: number | null | undefined,
  derniereRelanceLe: string | null | undefined,
  maintenant: Date = new Date(),
): boolean {
  const faites = typeof relances === 'number' && relances > 0 ? relances : 0
  if (faites < RELANCES_IMPAYE_MAX) return false
  const derniere = dateFin(derniereRelanceLe)
  if (!derniere) return false
  return maintenant.getTime() - derniere.getTime() >= JOURS_AVANT_FERMETURE * MS_JOUR
}

/**
 * L'avis de reconduction doit-il partir aujourd'hui ? Trois raisons de ne pas l'envoyer, et elles
 * comptent toutes : un abonnement déjà annulé (rien ne se reconduit), un abonnement mensuel sans
 * engagement (rien à annoncer), un avis déjà parti (on ne le répète pas).
 */
export function avisRenouvellementAEnvoyer(
  fin: string | null | undefined,
  frequence: string | null | undefined,
  annule: boolean | null | undefined,
  dejaEnvoye: boolean,
  maintenant: Date = new Date(),
): boolean {
  if (dejaEnvoye || annule || frequence !== 'an') return false
  const finPeriode = dateFin(fin)
  if (!finPeriode) return false
  const dans = finPeriode.getTime() - maintenant.getTime()
  return dans > 0 && dans <= JOURS_AVIS_RENOUVELLEMENT * MS_JOUR
}
