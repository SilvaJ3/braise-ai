// L'adresse d'une boutique — le lien qu'elle garde.
//
// Une seule fabrique, pour les mails comme pour l'écran (voir `src/lib/boutique-etat.ts`) : le
// jeton est la seule authentification, l'adresse dit où le porter — `braaise.io/boutique/<jeton>`,
// l'adresse définitive. Elle se change ici, et dans `lienBoutiqueUrl`, nulle part ailleurs.
//
// Aucune adresse n'est écrite en dur : la base d'un mail vient du réglage `site_url`
// (`reglages_produit`), le site qui sert la page — aujourd'hui `https://www.braaise.io`. Côté
// écran, `ORIGINE_BOUTIQUE` porte la même valeur (`src/lib/boutique-etat.ts`), et les deux suites
// de tests l'affirment sur la même chaîne.

export const CHEMIN_BOUTIQUE = '/boutique/'

/** `https://exemple.be/` + jeton → `https://exemple.be/boutique/<jeton>` */
export function lienBoutique(base: string, jeton: string): string {
  const b = String(base ?? '').trim().replace(/\/+$/, '')
  const j = String(jeton ?? '').trim()
  return j ? `${b}${CHEMIN_BOUTIQUE}${encodeURIComponent(j)}` : ''
}

/**
 * L'adresse à mettre dans un mail : celle du réglage, sans barre finale. Une base vide ou
 * inutilisable rend une chaîne vide — mieux vaut un mail sans lien qu'un lien qui ne mène nulle
 * part.
 */
export function baseLienBoutique(appUrl: string | null | undefined): string {
  const b = String(appUrl ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^/\s]+/i.test(b) ? b : ''
}
