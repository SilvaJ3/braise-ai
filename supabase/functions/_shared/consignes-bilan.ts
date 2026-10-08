// Consignes du bilan hebdomadaire, et les garde-fous qui vérifient ce que le modèle rend.
//
// Méthode ig-viral transposée (voir BRAISE-SUGGESTION-CONTENU.md) : l'idée n'est pas « ce qui a fait des
// vues » mais « ce qui s'est vendu chez cet artisan », jugé contre SA médiane (fonction SQL
// `anomalies_ventes`, migration 0089). Les consignes ne contiennent rien de propre à un compte : elles
// sont le premier bloc du prompt, identique d'un compte à l'autre, donc relu à 0,1x par le cache.
import { catalogueEnTexte, NOMS_FORMULES } from './formules-accroche.ts'

export const SEUIL_HAUT = 3
export const SEUIL_BAS = 0.5

export const CONSIGNES_BILAN = `Prépare le bilan de la semaine.

1. 4 idées de publications concrètes pour les 2 prochaines semaines, toutes NOUVELLES.

   Pars du bloc « Ventes de ces 30 jours » donné plus bas. Il compare chaque article à la médiane de
   cet artisan : rapport au-dessus de ${SEUIL_HAUT}, c'est un signal haut (l'article a décollé) ; rapport sous ${SEUIL_BAS}, c'est un
   signal bas (l'article a décroché). Les deux valent une idée. Montrer ce qui a raté est aussi
   utile que montrer ce qui a marché, et personne dans la niche ne le fait. Un article ordinaire
   ne mérite aucune idée : ne propose rien sur un article absent de ce bloc.
   Si le bloc dit que l'historique est trop mince ou qu'aucun article ne sort de l'ordinaire, ne
   chiffre rien : appuie-toi sur la saison, le stock, les retours de performance et ce que cette
   personne est seule à pouvoir montrer (son atelier, ses matières, ses clients).

   Pour CHAQUE idée, choisis une formule dans le catalogue ci-dessous et nomme-la exactement, dans le
   champ formule. Une formule est une FORME à remplir avec les faits de cette personne, jamais un
   script à recopier : l'exemple d'un autre métier ne se reprend pas.

   Dès qu'une idée s'appuie sur un article du bloc des ventes, le texte à dire (champ a_dire) contient
   au moins un chiffre issu de ce bloc : unités vendues, médiane, rapport. Nombres, pas adjectifs :
   « 12 bols vendus en octobre » et non « ça a bien marché ». Ne rends jamais un chiffre absent des
   données. Le champ ecran est l'accroche affichée à l'écran : 6 mots ou moins.

   Les idées sur un signal haut ne portent que sur des produits réellement en stock. Une idée sur un
   signal bas peut porter sur un article invendu.

   Dis ce qui s'est vendu et propose une façon de le raconter. Ne promets aucune vue, ne dis jamais
   qu'une publication fera vendre, ne présente jamais une vente passée comme l'effet d'une publication.
   Tu ne sais rien d'Instagram ni de ce qui marche en ce moment : n'en parle pas.

2. 1 à 3 observations utiles sur son planning (trous, idées qui stagnent, plateforme
   délaissée, saisonnalité). Ce sont des constats, pas des ordres.

Catalogue des formules d'accroche (12) :
${catalogueEnTexte()}

Avant de rendre, passe chaque texte (titre, a_dire, ecran, note, observations) au filtre
anti-« français d'IA ». Tu écris comme une personne qui parle devant sa caméra :
- aucun tiret cadratin ni demi-cadratin ; une virgule, un point ou deux-points suffisent ;
- jamais « il ne s'agit pas de X mais de Y », ni « ce n'est pas X, c'est Y » ;
- pas de triptyque rhétorique : trois éléments alignés pour le rythme (« la terre, le feu, le geste ») ;
- pas de mots creux : « véritable », « univers », « plongez », « découvrez », « sublimer », « authentique » ;
- phrases courtes, mots de l'atelier, tutoiement. Si une phrase ne se dirait pas à voix haute, réécris-la.

Rends ton travail via l'outil rendre_bilan. N'écris pas de texte en dehors de l'outil.

INTERDIT ABSOLU : ne repropose aucune des idées déjà présentes dans le planning donné plus bas,
même reformulée, même avec un autre angle, une autre plateforme ou un autre format.`

export type LigneAnomalie = {
  designation: string
  ventes_30j: number | string
  mediane_mensuelle: number | string
  rapport: number | string
  signal: string
}

const nb = (v: number | string) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })

/**
 * Le bloc « Ventes de ces 30 jours » : ne cite QUE les signaux haut et bas. Un article ordinaire
 * n'y figure pas, donc le modèle n'a aucune matière pour en faire une suggestion.
 */
export function formaterAnomalies(lignes: LigneAnomalie[] | null | undefined): string {
  const l = lignes ?? []
  if (!l.length) return 'Ventes de ces 30 jours : aucune vente déclarée sur 3 mois. Ne chiffre rien.'
  if (l.some((x) => x.signal === 'insuffisant')) {
    return "Ventes de ces 30 jours : l'historique est trop mince (moins de 15 unités sur 3 mois) pour comparer les articles. Ne chiffre rien."
  }
  const ligne = (x: LigneAnomalie) =>
    `- ${x.designation} : ${nb(x.ventes_30j)} vendus en 30 jours, médiane mensuelle de ses articles ${nb(x.mediane_mensuelle)}, rapport ${nb(x.rapport)}`
  const haut = l.filter((x) => x.signal === 'haut').slice(0, 3)
  const bas = l.filter((x) => x.signal === 'bas').slice(0, 3)
  if (!haut.length && !bas.length) {
    return "Ventes de ces 30 jours : aucun article ne sort de l'ordinaire. Ne chiffre rien."
  }
  return [
    'Ventes de ces 30 jours (chiffres du journal de ventes, comparés à la médiane de cet artisan) :',
    ...(haut.length ? ['Signal haut (a décollé) :', ...haut.map(ligne)] : []),
    ...(bas.length ? ['Signal bas (a décroché) :', ...bas.map(ligne)] : []),
  ].join('\n')
}

/** Vrai quand le bloc des ventes porte au moins un signal haut ou bas : le texte à dire doit alors être chiffré. */
export const aUnSignal = (lignes: LigneAnomalie[] | null | undefined): boolean =>
  (lignes ?? []).every((x) => x.signal !== 'insuffisant') &&
  (lignes ?? []).some((x) => x.signal === 'haut' || x.signal === 'bas')

export type IdeeBilan = {
  title?: string
  formule?: string
  a_dire?: string
  ecran?: string
  note?: string
}

/** Tirets cadratins et demi-cadratins : remplacés par une virgule (le filtre du prompt les interdit déjà). */
export const sansTiretCadratin = (t: string) => t.replace(/\s*[—–]\s*/g, ', ')

// Seule « il ne s'agit pas de » est refusée par code : « ce n'est pas cher » est du français ordinaire,
// l'autre moitié du filtre (« ce n'est pas X, c'est Y ») reste du ressort des consignes.
const TOURNURE_IA = /\bil\s+ne\s+s['’]agit\s+pas\b/i

/**
 * Vérifie ce que le modèle a rendu pour une idée. `avecSignal` : le bilan avait un signal haut ou bas
 * à exploiter, donc le texte à dire doit porter un chiffre. Rend la raison du refus, ou null.
 */
export function refusIdee(idee: IdeeBilan, avecSignal: boolean): string | null {
  if (!idee.formule || !NOMS_FORMULES.includes(idee.formule)) return 'formule absente ou hors catalogue'
  const dit = idee.a_dire ?? ''
  if (avecSignal && !/\d/.test(dit)) return 'aucun chiffre dans le texte à dire'
  if (idee.ecran && idee.ecran.trim().split(/\s+/).length > 6) return "accroche d'écran de plus de 6 mots"
  const tout = [idee.title, dit, idee.ecran, idee.note].filter(Boolean).join(' ')
  if (TOURNURE_IA.test(tout)) return "tournure « il ne s'agit pas de X mais de Y »"
  return null
}

/** Le texte stocké au planning : tout ce que l'artisan colle ou filme, tiré des champs de l'idée. */
export function noteIdee(idee: IdeeBilan): string {
  return sansTiretCadratin(
    [
      idee.a_dire ? `À dire : ${idee.a_dire}` : '',
      idee.ecran ? `En écran : ${idee.ecran}` : '',
      idee.formule ? `Formule : ${idee.formule}` : '',
      idee.note ?? '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}
