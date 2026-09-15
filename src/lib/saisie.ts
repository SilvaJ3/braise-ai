// Saisie de lignes à la volée (bon de dépôt, commande) : mêmes besoins des deux côtés, donc
// une seule implémentation plutôt qu'une copie par écran.

/** Clé locale d'une ligne en cours de saisie. React a besoin d'un identifiant stable par ligne
 * ajoutée, et la ligne n'existe pas encore en base au moment de l'ajout. */
export const cle = () => Math.random().toString(36).slice(2)

/** Nombre tapé à la main : la virgule décimale du clavier belge est acceptée, une valeur
 * illisible ou négative retombe sur 0 (jamais NaN dans un champ de saisie). */
export const nombre = (v: string): number => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}
