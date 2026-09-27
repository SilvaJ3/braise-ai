/**
 * Le geste « cet article n'est pas encore dans ma liste » d'un marché, réduit à ses lectures :
 * lire le prix tapé sur le téléphone, et reconnaître un produit déjà au catalogue pour ne pas en
 * créer un second. Fonctions pures, hors du module des requêtes : ce fichier s'importe et se teste
 * sans client Supabase ni variable d'environnement.
 */

/**
 * Le prix saisi, ou `null` si ce n'est pas un prix. Le clavier belge donne la virgule (« 12,50 »),
 * le pavé numérique des navigateurs donne le point : les deux passent. Un article vendu au marché
 * a un prix : zéro, le vide et le négatif sont refusés.
 */
export function prixSaisi(texte: string): number | null {
  const t = texte.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/** Le nom comparé sans casse ni espaces surnuméraires : c'est la clé du rapprochement. */
export function nomNormalise(nom: string): string {
  return nom.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr')
}

/**
 * Le produit du catalogue qui porte déjà ce nom. L'appeler avant de créer évite le doublon
 * « Bougie cèdre » / « bougie  cèdre » qui se retrouve ensuite dans trois listes déroulantes.
 */
export function produitDuCatalogue<T extends { nom: string }>(produits: T[], nom: string): T | undefined {
  const cle = nomNormalise(nom)
  if (!cle) return undefined
  return produits.find((p) => nomNormalise(p.nom) === cle)
}
