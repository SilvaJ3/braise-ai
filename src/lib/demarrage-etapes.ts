// Ce qu'il reste à faire pour que l'app serve à quelque chose — le calcul seul, sans Supabase.
//
// Rien ici n'est un « tutoriel » : aucune étape ne se coche parce qu'elle a été vue, ni parce
// qu'un drapeau a été posé. Chacune disparaît quand la donnée existe vraiment, et la carte
// elle-même s'efface à la dernière (ou se masque pour de bon, colonne `demarrage_ferme_at`).
// Le seuil est volontairement grossier : « au moins un produit », pas « un catalogue complet ».
//
// Le fichier est séparé des accès réseau (lib/demarrage.ts) pour que ce calcul reste testable
// sans client Supabase — même raison que lib/dates.ts.

export type CleDemarrage = 'boutique' | 'produits' | 'bon' | 'planning'

export type EtapeDemarrage = {
  cle: CleDemarrage
  titre: string
  detail: string
  action: string
  vers: string
  /** État de navigation éventuel — le Planning ouvre son formulaire sur `new`. */
  etat?: { new?: boolean }
}

export type EtatDemarrage = {
  /** Nombre de boutiques (dépôt-vente) déjà enregistrées. */
  boutiques: number
  /** Id de la seule boutique du compte : le premier bon part alors directement de sa fiche. */
  boutiqueUnique: string | null
  produits: number
  /** Bons signés ou envoyés : un brouillon abandonné ne compte pas comme un bon fait. */
  bons: number
  /** Entrées du planning, publiées ou non. */
  idees: number
}

const MAX_ETAPES = 3

/**
 * Les étapes encore à faire, dans l'ordre où elles se présentent, plafonnées à trois.
 *
 * L'ordre suit les dépendances réelles : une boutique et des produits avant le premier bon (il n'y
 * a rien à déposer sans eux), le planning en dernier parce qu'il ne dépend de rien et qu'il sera
 * toujours là demain. Une étape dont les prérequis manquent n'est pas affichée du tout : mieux
 * vaut ne pas en parler que promettre un écran qui ne mène nulle part.
 */
export function etapesDemarrage(etat: EtatDemarrage, max = MAX_ETAPES): EtapeDemarrage[] {
  const toutes: (EtapeDemarrage & { faite: boolean; debloquee: boolean })[] = [
    {
      cle: 'boutique',
      titre: 'Ajoute une boutique où tu déposes',
      detail: "C'est de là que partent les bons de dépôt et les relances.",
      action: 'Ajouter',
      vers: '/boutiques?nouvelle=1',
      faite: etat.boutiques > 0,
      debloquee: true,
    },
    {
      cle: 'produits',
      titre: 'Mets tes produits au propre',
      detail: 'Un Excel, un CSV, une photo de liste — ou trois à la main.',
      action: 'Importer',
      vers: '/atelier?tab=import&entity=produits',
      faite: etat.produits > 0,
      debloquee: true,
    },
    {
      cle: 'bon',
      titre: 'Fais signer ton premier bon de dépôt',
      detail: 'Rempli sur place, signé au doigt, envoyé par mail à la boutique.',
      action: 'Créer',
      vers: etat.boutiqueUnique ? `/boutiques/${etat.boutiqueUnique}/depot` : '/boutiques',
      faite: etat.bons > 0,
      debloquee: etat.boutiques > 0 && etat.produits > 0,
    },
    {
      cle: 'planning',
      titre: 'Note ta première idée de publication',
      detail: 'Le planning te dit quoi préparer, sans y repenser chaque matin.',
      action: 'Noter',
      vers: '/planning',
      etat: { new: true },
      faite: etat.idees > 0,
      debloquee: true,
    },
  ]

  return toutes
    .filter((e) => e.debloquee && !e.faite)
    .slice(0, max)
    .map((e) => ({ cle: e.cle, titre: e.titre, detail: e.detail, action: e.action, vers: e.vers, etat: e.etat }))
}
