// Le parcours « mot de passe oublié » : la part PURE, testable sans navigateur ni réseau.
//
// POURQUOI CE FICHIER. L'app n'avait aucun moyen de se débloquer seule : un artisan qui perdait son
// mot de passe n'avait pas de chemin de retour. La partie qui décide — l'adresse de retour et le
// message affiché — vit ici, hors du composant, pour être vérifiée par un test. L'appel réseau et
// l'écran vivent dans `Login.tsx` et `routes/NouveauMotDePasse.tsx`.
//
// DEUX RÈGLES, ET ELLES SONT DE SÉCURITÉ :
// 1. L'adresse de retour est construite depuis l'origine courante, JAMAIS écrite en dur : le lien
//    doit ramener sur le domaine où l'artisan a demandé la réinitialisation.
// 2. Le message est TOUJOURS le même. Il ne dit jamais si l'adresse a un compte : dire « cette
//    adresse est inconnue » permettrait d'énumérer les comptes existants.

// La validation du mot de passe n'est pas réécrite : c'est celle de l'inscription, une seule règle
// pour tout le produit (au moins 10 caractères, une minuscule, une majuscule, un chiffre).
export { MOT_DE_PASSE_MIN, motDePasseInvalide } from '../../supabase/functions/_shared/inscription'

/** Ce qu'on affiche après la demande — qu'un compte existe ou non. */
export const MESSAGE_NEUTRE = 'Si cette adresse a un compte, le lien vient de partir.'

/**
 * L'adresse vers laquelle Supabase renvoie après le clic sur le lien de réinitialisation :
 * l'origine courante + `/nouveau-mot-de-passe`. Une origine vide (cas limite) rend un chemin
 * relatif valable dans le navigateur plutôt qu'un `undefined/nouveau-mot-de-passe`.
 */
export function urlRetourReinitialisation(origine: string): string {
  const base = String(origine ?? '').trim().replace(/\/+$/, '')
  return base ? `${base}/nouveau-mot-de-passe` : '/nouveau-mot-de-passe'
}
