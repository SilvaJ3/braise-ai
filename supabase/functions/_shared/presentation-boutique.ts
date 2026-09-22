// Le premier contact d'une boutique : ce qu'est Braaise, et à quoi sert le lien qu'elle reçoit.
//
// Pourquoi ce mail existe : les rappels (le 1er, le 5) parlent chiffres et relevés à une boutique
// qui n'a jamais vu le produit — elle reçoit l'état d'un outil dont elle ignore tout. Décision de
// JSB du 20/09/2026 : les rappels ne s'arment pas tant que cette présentation n'existe pas. Elle
// part donc au moment où le lien naît, c'est-à-dire avec le premier bon de dépôt — le seul instant
// où l'artisan et la boutique se parlent vraiment pour la première fois.
//
// Ce que ce texte ne fait pas : promettre quelque chose que l'app ne fasse. Pas de caisse, pas de
// comptabilité, pas d'inventaire garanti — « il vous reste » est une indication tirée de ce qui a
// été noté, et c'est la boutique qui a les pièces sous les yeux. Dire ces limites fait partie du
// produit (BRAISE-POSITIONNEMENT.md), et c'est ce qui rend crédible la phrase d'après.
//
// L'adresse de la page n'est jamais écrite ici : elle vient du réglage `site_url`, comme partout
// ailleurs (voir `lien-boutique.ts`). TypeScript pur, ni base ni réseau : ce texte se vérifie dans
// un test (voir `presentation-boutique.test.ts`).

import { mailHtml } from './mail-html.ts'

export type PresentationEmail = { subject: string; text: string; html: string }

export type PresentationArgs = {
  /** Le nom commercial de l'artisan, tel qu'il signe ses bons. */
  artisan: string
  /** Le nom de la boutique à qui le lien appartient. */
  boutique: string
  /** Le lien complet de la boutique (déjà construit depuis `site_url`). */
  lien: string
}

/**
 * Une boutique ne se présente qu'une fois : il faut un lien à montrer, et pas de trace d'envoi.
 * Le jour où le marqueur existe, la présentation est close pour ce lien — même si l'artisan
 * renvoie un bon plus tard.
 */
export function fautPresenter(lien: string, presentationEnvoyeeLe: string | null | undefined): boolean {
  return String(lien ?? '').trim() !== '' && !presentationEnvoyeeLe
}

/** « Au Coin du Feu — à quoi sert le lien que vous avez reçu » */
export function objetPresentation(artisan: string): string {
  const qui = artisan.trim()
  return qui ? `${qui} — à quoi sert le lien que vous avez reçu` : 'À quoi sert le lien que vous avez reçu'
}

/**
 * Le mail complet : version brute (celle qui s'affiche partout) et version mise en page.
 * Les paragraphes sont les mêmes des deux côtés : une phrase ne se corrige qu'à un endroit.
 * `lien` vide = pas de bouton, et le texte le dit — mieux vaut pas de lien qu'un lien mort.
 */
export function construirePresentation(args: PresentationArgs): PresentationEmail {
  const artisan = args.artisan.trim() || 'Votre artisan'
  const boutique = args.boutique.trim()
  const lien = String(args.lien ?? '').trim()
  const chez = boutique ? ` chez ${boutique}` : ' chez vous'

  const corps = [
    `${artisan} dépose ses pièces${chez} et suit ses dépôts avec Braaise. Le lien reçu dans le mail précédent est votre page : voici à quoi elle sert.`,
    "Ce que vous y trouvez : les pièces déposées et le bon qui les accompagne, ce qu'il vous en reste d'après ce qui a été noté, une case pour dire ce qui a été vendu et une pour les pièces reprises, et de quoi demander un réassort.",
    "Ce qu'on attend de vous : une fois par mois, quelques minutes. Vous dites ce qu'il vous reste, la page en déduit ce qui est parti — c'est le geste que vous faites déjà à la main. Si tout a été vendu, vous n'avez qu'à le confirmer.",
    "Ce qui reste chez l'artisan : les pièces sont sa propriété jusqu'à la vente, et le bon signé reste la pièce qui compte. Braaise ne tient pas votre caisse et ne fait ni facture ni comptabilité : votre relevé est daté et à votre nom, c'est lui qui le valide.",
    "Votre lien est personnel : il ne montre que les pièces de cet artisan chez vous, jamais son stock ni les autres boutiques. Il n'y a rien à installer, rien à payer, et aucun compte à créer.",
  ]

  // Un paragraphe par bloc dans la version brute aussi : c'est celle qui s'affiche quand le client
  // refuse le HTML, et un pavé y est illisible.
  const parts = ['Bonjour,', '', ...corps.flatMap((p) => [p, ''])]
  if (lien) {
    parts.push(lien, '', "C'est toujours la même adresse — gardez-la.")
  } else {
    parts.push("L'adresse de votre page est en train d'être mise à jour : répondez à ce mail, nous vous la renvoyons.")
  }
  parts.push(
    '',
    'Pour toute question, répondez simplement à ce mail.',
    '',
    ...(args.artisan.trim() ? [args.artisan.trim()] : []),
  )

  const html = mailHtml({
    expediteur: artisan,
    titre: 'Vos pièces, et votre lien',
    paragraphes: corps,
    ...(lien ? { cta: { libelle: 'Ouvrir ma page', url: lien } } : {}),
    note: lien
      ? "C'est toujours la même adresse : gardez-la, elle ne changera pas."
      : "L'adresse de votre page est en train d'être mise à jour : répondez à ce mail, nous vous la renvoyons.",
    pied:
      "Vous recevez ce message parce qu'un artisan vous a confié ses pièces. " +
      'Répondez à ce mail pour le joindre directement.',
    resume: `${artisan} : à quoi sert votre page, et ce qu'on attend de vous.`,
  })

  return { subject: objetPresentation(args.artisan), text: parts.join('\n'), html }
}
