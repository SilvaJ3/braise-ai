// L'adresse d'une boutique — le lien qu'elle garde.
//
// Une seule fabrique, pour les mails comme pour l'écran (voir `src/lib/boutique-etat.ts`) : le
// jeton est la seule authentification, l'adresse dit où le porter. Le jour où l'adresse définitive
// `braaise.io/boutique/<jeton>` est câblée, c'est ici — et dans `lienBoutiqueUrl` — que ça se
// change, et nulle part ailleurs.
//
// Aucune adresse n'est écrite en dur : la base d'un mail vient du réglage `app_url`
// (`reglages_produit`), celle de l'écran vient de l'origine de la page courante. Les deux mènent à
// la même page, et c'est voulu tant que le domaine n'est pas tranché.

export const CHEMIN_BOUTIQUE = '/boutique/'

/** `https://exemple.be/` + jeton → `https://exemple.be/boutique/?t=…` */
export function lienBoutique(base: string, jeton: string): string {
  const b = String(base ?? '').trim().replace(/\/+$/, '')
  return `${b}${CHEMIN_BOUTIQUE}?t=${encodeURIComponent(String(jeton ?? '').trim())}`
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
