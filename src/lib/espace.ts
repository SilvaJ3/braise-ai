// Quel visage de l'application montrer : celui de l'artisan (par défaut) ou celui de la boutique.
// C'est la même application et le même déploiement ; seule l'ENTRÉE change (la page de connexion). Une fois connecté, l'espace
// vient du compte (`mon_compte_boutique`), jamais de l'adresse : un artisan qui se connecte ici garde son atelier.
export const HOTE_BOUTIQUE = 'boutique.braaise.io'

/** `?espace=boutique` permet de voir cette entrée sur n'importe quel hôte (aperçu, essais) sans toucher au DNS. */
export function estEspaceBoutique(hote: string, recherche = ''): boolean {
  return hote.trim().toLowerCase() === HOTE_BOUTIQUE || new URLSearchParams(recherche).get('espace') === 'boutique'
}
