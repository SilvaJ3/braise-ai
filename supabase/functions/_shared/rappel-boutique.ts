// Le rappel mensuel d'une boutique : ce qu'on lui dit, et quand.
//
// Deux envois, jamais plus d'un par mois et par boutique (la table `boutique_rappels` le garantit,
// pas la mémoire du cron) :
//
//   · le 1er — le point : ce qu'elle a déclaré le mois dernier, et ce qu'il lui reste d'après nos
//     comptes. Jamais « un relevé est disponible » : un état, avec des chiffres ;
//   · le 5 — la relance, seulement s'il manque une déclaration pour le mois en cours. Même état,
//     ton plus direct.
//
// « Il vous reste » est une indication issue de ce qui a été encodé, jamais une garantie : l'app
// ne dit pas « gère ton stock », elle demande à la boutique de compter (doctrine, Braaise n'est
// pas un logiciel de gestion). D'où la formule « d'après nos comptes », qui laisse la vérité à
// celle qui a les pièces sous les yeux.
//
// Le texte est ici, en TypeScript pur : il se vérifie sans base et sans réseau (voir le test).

import { fmtQte, moisLisible } from './depot-doc.ts'
import { mailHtml } from './mail-html.ts'

export type TypeRappel = 'rappel' | 'relance'

export type PartenaireRappel = {
  partenaire_id: string
  /** Le nom commercial de l'artisan, tel qu'il signe ses bons. */
  artisan: string
  artisan_email: string
  /** Ce qu'elle a déclaré pour le mois précédent. */
  ventes_mois: number
  reprises_mois: number
  entrees_mois: number
  /** Déposé + reçu sans bon − vendu − repris, d'après nos comptes. */
  restant: number
  /** Une déclaration existe déjà pour le mois en cours. */
  declare_ce_mois: boolean
}

export type BoutiqueRappel = {
  lien_id: string
  email: string
  jeton: string
  a_declarer: boolean
  partenaires: PartenaireRappel[]
}

export type RappelEmail = { subject: string; text: string; html: string }

/**
 * Le type d'envoi du jour. Le cron passe tous les jours (07:00 UTC) et c'est cette fonction qui
 * décide : le 1er le point, le 5 la relance, les autres jours le rattrapage d'un envoi resté en
 * panne. 07:00 UTC tombe le même jour à Bruxelles toute l'année : le jour UTC suffit.
 */
export function typeRappelDuJour(jourDuMois: number): TypeRappel | null {
  if (jourDuMois === 1) return 'rappel'
  if (jourDuMois === 5) return 'relance'
  return null
}

/** « 2 vendues et 1 reprise en août ; il vous reste 2 pièces d'après nos comptes. » */
export function phraseMouvements(p: PartenaireRappel, moisPrecedent: string): string {
  const mois = moisLisible(moisPrecedent)
  const bouts: string[] = []
  if (p.ventes_mois > 0) bouts.push(`${fmtQte(p.ventes_mois)} vendue${p.ventes_mois > 1 ? 's' : ''}`)
  if (p.reprises_mois > 0) bouts.push(`${fmtQte(p.reprises_mois)} reprise${p.reprises_mois > 1 ? 's' : ''}`)
  const reste = `il vous reste ${fmtQte(p.restant)} pièce${Math.abs(p.restant) > 1 ? 's' : ''} d'après nos comptes`
  return bouts.length ? `${bouts.join(' et ')} en ${mois} ; ${reste}.` : `rien de nouveau pour ${mois} ; ${reste}.`
}

/** « Au Coin du Feu » — ou « Au Coin du Feu et deux autres » quand la boutique en a plusieurs. */
export function signatureGroupee(partenaires: PartenaireRappel[]): string {
  const noms = partenaires.map((p) => p.artisan).filter(Boolean)
  if (!noms.length) return ''
  if (noms.length === 1) return noms[0]
  if (noms.length === 2) return `${noms[0]} et ${noms[1]}`
  return `${noms[0]} et ${noms.length - 1} autres`
}

function objet(type: TypeRappel, partenaires: PartenaireRappel[], moisCourant: string): string {
  const qui = signatureGroupee(partenaires)
  // Dans un objet, le mois suffit : le mail part le 5 du mois même. Le millésime reste dans le corps.
  const mois = moisLisible(moisCourant).replace(/ \d{4}$/, '')
  const tete = qui ? `${qui} — ` : ''
  return type === 'relance'
    ? `${tete}il nous manque votre relevé de ${mois}`
    : `${tete}où en sont vos pièces ?`
}

/**
 * Le mail complet : version brute (celle qui s'affiche partout) et version mise en page.
 * `lien` vide = pas de bouton, et le texte le dit — mieux vaut pas de lien qu'un lien mort.
 */
export function construireRappel(args: {
  type: TypeRappel
  lien: string
  moisCourant: string
  moisPrecedent: string
  partenaires: PartenaireRappel[]
}): RappelEmail {
  const { type, lien, moisCourant, moisPrecedent, partenaires } = args
  const qui = signatureGroupee(partenaires)
  const mois = moisLisible(moisCourant)

  const lignes = partenaires.map((p) => `${p.artisan} — ${phraseMouvements(p, moisPrecedent)}`)
  const sansMouvement = !partenaires.some((p) => p.ventes_mois > 0 || p.reprises_mois > 0)

  const intro =
    type === 'relance'
      ? `Nous n'avons encore rien reçu pour ${mois} : c'est ce qui nous manque pour savoir où vous en êtes.`
      : `Le point sur ce qui est déposé chez vous.`

  const parts = [
    'Bonjour,',
    '',
    intro,
    '',
    ...lignes,
    '',
    type === 'relance'
      ? 'Deux minutes suffisent pour compter ce qu\'il vous reste et nous le dire :'
      : 'Pour compter ce qu\'il vous reste et nous le dire :',
  ]
  if (lien) {
    parts.push(lien, '', "C'est toujours la même adresse — gardez-la.")
  } else {
    parts.push("L'adresse de votre page est en train d'être mise à jour : répondez à ce mail, nous vous la renvoyons.")
  }
  parts.push(
    '',
    'Ce message fait partie du suivi de vos dépôts : il n\'y a rien à installer, et rien à payer.',
    'Pour toute question, répondez simplement à ce mail.',
    '',
    ...partenaires.map((p) => p.artisan).filter(Boolean),
  )

  const paragraphes = [
    intro,
    ...lignes,
    sansMouvement
      ? "Si vous avez vendu quelque chose, dites-le nous : c'est ce que nous ne pouvons pas deviner."
      : "Ce que nous ne pouvons pas deviner, c'est ce qui est resté : c'est vous qui avez les pièces.",
  ]

  const resume = partenaires.length ? `${partenaires[0].artisan} : ${phraseMouvements(partenaires[0], moisPrecedent)}` : ''

  const html = mailHtml({
    expediteur: qui || 'Suivi des dépôts',
    titre: type === 'relance' ? 'Il nous manque votre relevé' : 'Où en sont vos pièces ?',
    paragraphes,
    ...(lien ? { cta: { libelle: type === 'relance' ? 'Faire mon relevé' : 'Compter et nous le dire', url: lien } } : {}),
    note: lien
      ? "C'est toujours la même adresse : gardez-la, elle ne changera pas."
      : "L'adresse de votre page est en train d'être mise à jour : répondez à ce mail, nous vous la renvoyons.",
    pied:
      "Vous recevez ce message parce qu'un artisan vous a confié ses pièces. " +
      'Répondez à ce mail pour le joindre directement.',
    ...(resume ? { resume } : {}),
  })

  return { subject: objet(type, partenaires, moisCourant), text: parts.join('\n'), html }
}
