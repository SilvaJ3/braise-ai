// Le délai pour signaler un écart sur un bon — module PUR, testable.
//
// Décision de JSB (04/10) : le délai est de TROIS JOURS après le dépôt, et il ne BLOQUE rien. Passé ce
// délai, la boutique peut encore signaler un écart (une découverte tardive peut être légitime, et un
// refus sortirait le litige de Braaise), mais le signalement est MARQUÉ « tardif » pour l'artisan : un
// écart constaté une semaine après le dépôt ne se vérifie plus, et il doit le savoir en le lisant.
//
// Aucune colonne n'est nécessaire : la base garde déjà la date du dépôt et celle du signalement
// (`bon_contestations.cree_le`). Le jour du dépôt est le jour 0 ; le délai court jusqu'au jour 3 inclus.
// Le rappel d'un bon non confirmé (désarmé par défaut) vit côté serveur : il n'est pas ici.

export const DELAI_CONTESTATION_JOURS = 3

const MS_PAR_JOUR = 86_400_000

/** Le jour calendaire (UTC) d'une date ISO, en jours depuis 1970 ; null si la valeur est illisible. */
function jourNumero(v: string | Date | null | undefined): number | null {
  if (v == null) return null
  const brut = v instanceof Date ? v.toISOString() : String(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(brut)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PAR_JOUR)
}

/** Jours entiers écoulés entre le dépôt et `quand` (0 = le jour même), ou null si une date est illisible. */
export function joursDepuisDepot(dateDepot: string | null | undefined, quand: string | Date): number | null {
  const a = jourNumero(dateDepot)
  const b = jourNumero(quand)
  return a === null || b === null ? null : b - a
}

/** Le dernier jour du délai, écrit « 18/10/2026 », ou null si la date du dépôt est illisible. */
export function limiteContestation(dateDepot: string | null | undefined): string | null {
  const a = jourNumero(dateDepot)
  if (a === null) return null
  const d = new Date((a + DELAI_CONTESTATION_JOURS) * MS_PAR_JOUR)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

/** Ce que lit la boutique avant de signaler : le délai si elle est dedans, la règle du « tardif » sinon. */
export function phraseDelai(dateDepot: string | null | undefined, maintenant: Date = new Date()): string {
  const jours = joursDepuisDepot(dateDepot, maintenant)
  const limite = limiteContestation(dateDepot)
  if (jours === null || limite === null) {
    return `Signale tout écart dans les ${DELAI_CONTESTATION_JOURS} jours qui suivent le dépôt.`
  }
  return jours <= DELAI_CONTESTATION_JOURS
    ? `Signale tout écart avant le ${limite} (${DELAI_CONTESTATION_JOURS} jours après le dépôt).`
    : `Le délai de ${DELAI_CONTESTATION_JOURS} jours après le dépôt est passé : tu peux encore signaler un écart, il sera marqué « tardif » pour l’artisan.`
}

/**
 * Un signalement est-il tardif, et de combien de jours ? null = on ne peut pas le dire (date illisible) :
 * on ne marque jamais « tardif » sur une donnée qu'on ne sait pas lire.
 */
export function signalementTardif(
  dateDepot: string | null | undefined,
  creeLe: string | null | undefined,
): { tardif: boolean; jours: number } | null {
  const jours = joursDepuisDepot(dateDepot, creeLe ?? '')
  return jours === null ? null : { tardif: jours > DELAI_CONTESTATION_JOURS, jours }
}

/** « Tardif : signalé 9 jours après le dépôt », ou null si le signalement est dans les temps (ou illisible). */
export function libelleTardif(dateDepot: string | null | undefined, creeLe: string | null | undefined): string | null {
  const t = signalementTardif(dateDepot, creeLe)
  if (!t?.tardif) return null
  return `Tardif : signalé ${t.jours} jours après le dépôt`
}
