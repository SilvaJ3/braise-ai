// Ce qu'une boutique vient de faire, dit à l'artisan — et dit DEUX fois.
//
// Une boutique confirme un bon reçu, ou demande un réassort : deux gestes qu'elle fait seule, sans
// rendez-vous, et que l'artisan doit connaître tout de suite. Deux canaux, jamais un seul : le push
// pour être vu dans la minute, le mail pour être sûr — un appareil dont l'abonnement push a expiré
// ne doit pas faire disparaître l'information.
//
// Les textes vivent ici, en TypeScript pur : ils se vérifient sans base et sans réseau (voir le
// test), et la fonction edge ne fait que les porter.
//
// Le registre suit celui de l'app : « tu » pour l'artisan, qui reçoit le message. Aucun mot genré —
// le produit parle des artisans, jamais des artisanes (voir BRAISE-POSITIONNEMENT.md).

import { fmtDateCourte, fmtDateLongue, fmtEuro, fmtQte } from './depot-doc.ts'
import { LOGO_BRAAISE, mailHtml } from './mail-html.ts'

export type TypeNotifArtisan = 'bon_confirme' | 'reassort' | 'stock_mouvement' | 'releve_emis'

export type Ligne = { designation: string; quantite: number }

export type BonConfirme = {
  /** Le nom de la boutique tel qu'il est figé sur le bon. */
  boutique: string
  numero: string
  /** La date du dépôt lui-même — celle qui figure sur la pièce signée. */
  date_depot: string
  /** La date de la confirmation : le fait qu'on annonce. */
  confirme_le: string
  lignes: Ligne[]
}

export type Reassort = {
  boutique: string
  /** L'échéance posée par l'app (délai du compte + deux semaines par défaut). */
  echeance: string
  lignes: Ligne[]
  /** Le mot laissé par la boutique, s'il y en a un. */
  note?: string | null
}

export type Push = { title: string; body: string }
export type Message = { subject: string; text: string; html: string }

export const nbPieces = (lignes: Ligne[]): number =>
  Math.round((lignes.reduce((t, l) => t + Number(l.quantite ?? 0), 0) + Number.EPSILON) * 100) / 100

/** « Bol × 6 · Plat × 2 » — le détail d'une ligne, tel qu'il s'écrit dans un texte. */
export const detailLigne = (l: Ligne): string => `${l.designation} × ${fmtQte(l.quantite)}`

/**
 * « 6 pièces (Bol, Plat et une autre) » — de quoi remplir une notification sans la noyer.
 * Au-delà de deux noms, on s'arrête : le détail complet est dans le mail et dans l'app.
 */
export function resumeLignes(lignes: Ligne[]): string {
  const n = nbPieces(lignes)
  const tete = `${fmtQte(n)} pièce${n > 1 ? 's' : ''}`
  const noms = lignes.map((l) => l.designation).filter(Boolean)
  if (!noms.length) return tete
  if (noms.length === 1) return `${tete} (${noms[0]})`
  if (noms.length === 2) return `${tete} (${noms[0]} et ${noms[1]})`
  return `${tete} (${noms[0]}, ${noms[1]} et ${noms.length - 2} autre${noms.length - 2 > 1 ? 's' : ''})`
}

// --- Le bon confirmé ---------------------------------------------------------------------------

export function pushBonConfirme(b: BonConfirme): Push {
  return {
    title: `${b.boutique} a reçu ton bon`,
    body: `Bon ${b.numero} — ${resumeLignes(b.lignes)}, confirmé le ${fmtDateCourte(b.confirme_le)}.`,
  }
}

export function mailBonConfirme(b: BonConfirme, args: { lien: string }): Message {
  const n = nbPieces(b.lignes)
  const pieces = `${fmtQte(n)} pièce${n > 1 ? 's' : ''}`

  const texte = [
    'Bonjour,',
    '',
    `${b.boutique} a confirmé avoir reçu le bon ${b.numero}, déposé le ${fmtDateLongue(b.date_depot)}.`,
    '',
    ...b.lignes.map((l) => `  ${detailLigne(l)}`),
    '',
    `${pieces} au total.`,
    '',
    "C'est cette confirmation qui fait foi : tant qu'une boutique n'a pas confirmé, les pièces ne",
    'sont pas comptées comme reçues chez elle.',
  ]
  if (args.lien) {
    texte.push('', 'Le bon, dans Braaise :', args.lien)
  }
  texte.push('', 'Pour toute question, réponds simplement à ce mail.')

  const html = mailHtml({
      logo: LOGO_BRAAISE,
    expediteur: 'Braaise',
    titre: `${b.boutique} a confirmé la réception`,
    paragraphes: [
      `Le bon ${b.numero}, déposé le ${fmtDateLongue(b.date_depot)}, vient d'être confirmé : ${pieces} reçues.`,
      "C'est cette confirmation qui fait foi. Tant qu'une boutique n'a pas confirmé, les pièces ne sont pas comptées comme reçues chez elle.",
    ],
    encadre: {
      lignes: [
        ['Boutique', b.boutique],
        ['Bon', b.numero],
        ['Déposé le', fmtDateLongue(b.date_depot)],
        ['Reçu le', fmtDateLongue(b.confirme_le)],
        ['Pièces', pieces],
      ],
    },
    ...(args.lien ? { cta: { libelle: 'Ouvrir le bon', url: args.lien } } : {}),
    pied:
      'Tu reçois ce message parce que Braaise te prévient dès qu’une de tes boutiques ' +
      'confirme un bon ou te demande un réassort.',
    resume: `${b.boutique} a confirmé avoir reçu ${pieces} (bon ${b.numero}).`,
  })

  return {
    subject: `${b.boutique} a confirmé la réception de ton bon ${b.numero}`,
    text: texte.join('\n'),
    html,
  }
}

// --- Le réassort demandé -----------------------------------------------------------------------

export function pushReassort(r: Reassort): Push {
  const quand = r.echeance ? ` — à préparer pour le ${fmtDateCourte(r.echeance)}` : ''
  return {
    title: `${r.boutique} te demande un réassort`,
    body: `${resumeLignes(r.lignes)}${quand}.`,
  }
}

export function mailReassort(r: Reassort, args: { lien: string }): Message {
  const n = nbPieces(r.lignes)
  const pieces = `${fmtQte(n)} pièce${n > 1 ? 's' : ''}`

  const texte = [
    'Bonjour,',
    '',
    `${r.boutique} te demande un réassort.`,
    '',
    ...r.lignes.map((l) => `  ${detailLigne(l)}`),
    '',
    r.echeance
      ? `${pieces} au total, à préparer pour le ${fmtDateLongue(r.echeance)}.`
      : `${pieces} au total.`,
  ]
  if (r.note) {
    texte.push('', `De sa part : « ${r.note} »`)
  }
  texte.push(
    '',
    'La demande est arrivée dans tes commandes, au statut « Demande » : c’est là que tu la suis,',
    'que tu l’ajustes et que tu la marques prête le jour où elle part.',
  )
  if (args.lien) {
    texte.push('', 'La commande, dans Braaise :', args.lien)
  }
  texte.push('', 'Pour toute question, réponds simplement à ce mail.')

  const html = mailHtml({
      logo: LOGO_BRAAISE,
    expediteur: 'Braaise',
    titre: `${r.boutique} te demande un réassort`,
    paragraphes: [
      `${pieces} à préparer${r.echeance ? ` pour le ${fmtDateLongue(r.echeance)}` : ''}.`,
      ...(r.note ? [`De sa part : « ${r.note} »`] : []),
      'La demande est arrivée dans tes commandes, au statut « Demande » : c’est là que tu la suis et que tu la marques prête.',
    ],
    encadre: {
      lignes: [
        ['Boutique', r.boutique],
        ...(r.echeance ? ([['À préparer pour', fmtDateLongue(r.echeance)]] as [string, string][]) : []),
        ['Pièces', pieces],
      ],
    },
    ...(args.lien ? { cta: { libelle: 'Ouvrir la commande', url: args.lien } } : {}),
    pied:
      'Tu reçois ce message parce que Braaise te prévient dès qu’une de tes boutiques ' +
      'confirme un bon ou te demande un réassort.',
    resume: `${r.boutique} te demande ${pieces}.`,
  })

  return { subject: `${r.boutique} te demande un réassort`, text: texte.join('\n'), html }
}


// --- Le mouvement de stock ---------------------------------------------------------------------
//
// La boutique a déclaré ce qu'elle a vendu : les pièces sortent de chez l'artisan, et son stock
// n'est plus le même. Ce message-le dit tout de suite, sans attendre qu'il ouvre l'app. Une
// déclaration peut couvrir plusieurs lignes : on donne le nombre de pièces et le montant qui en
// découle, pas le détail — il est dans l'app, et le mail de relevé arrive derrière.

export type StockMouvement = {
  boutique: string
  /** Le nombre de lignes déclarées (pas de pièces : les quantités sont dans le détail). */
  nb_lignes: number
  /** Le montant facturable issu de cette déclaration. */
  facturable: number
  /** La période de la déclaration (« 2026-10 »). */
  periode: string
}

export function pushStockMouvement(s: StockMouvement): Push {
  return {
    title: `${s.boutique} a déclaré des ventes`,
    body: `${s.nb_lignes} ligne${s.nb_lignes > 1 ? 's' : ''} — ${fmtEuro(s.facturable)} à facturer.`,
  }
}

export function mailStockMouvement(s: StockMouvement, args: { lien: string }): Message {
  const texte = [
    'Bonjour,',
    '',
    `${s.boutique} vient de déclarer ses ventes : ${s.nb_lignes} ligne${s.nb_lignes > 1 ? 's' : ''},`,
    `pour ${fmtEuro(s.facturable)}.`,
    '',
    'Ce sont des pièces qui ne sont plus chez elle. Le détail est dans l\'app, et le relevé',
    'facturable se génère depuis ton compte quand tu es prêt à facturer.',
    '',
    'C\'est cette déclaration qui fait foi : ce que la boutique annonce est ce que tu factures.',
  ]
  if (args.lien) {
    texte.push('', 'Dans Braaise :', args.lien)
  }
  texte.push('', 'Pour toute question, réponds simplement à ce mail.')

  const html = mailHtml({
      logo: LOGO_BRAAISE,
    expediteur: 'Braaise',
    titre: `${s.boutique} a déclaré des ventes`,
    paragraphes: [
      `${s.nb_lignes} ligne${s.nb_lignes > 1 ? 's' : ''} déclarée${s.nb_lignes > 1 ? 's' : ''}, pour ${fmtEuro(s.facturable)}.`,
      'Ce sont des pièces qui ne sont plus chez elle. Le relevé facturable se génère depuis ton compte quand tu es prêt à facturer.',
    ],
    encadre: {
      lignes: [
        ['Boutique', s.boutique],
        ['Période', s.periode],
        ['Lignes', String(s.nb_lignes)],
        ['À facturer', fmtEuro(s.facturable)],
      ],
    },
    ...(args.lien ? { cta: { libelle: 'Ouvrir dans Braaise', url: args.lien } } : {}),
    pied:
      'Tu reçois ce message parce que Braaise te prévient dès qu\'une de tes boutiques ' +
      'déclare des ventes, confirme un bon ou te demande un réassort.',
    resume: `${s.boutique} a déclaré ${s.nb_lignes} ligne(s), ${fmtEuro(s.facturable)} à facturer.`,
  })

  return {
    subject: `${s.boutique} a déclaré des ventes — ${fmtEuro(s.facturable)}`,
    text: texte.join('\n'),
    html,
  }
}

// --- Le relevé émis ----------------------------------------------------------------------------
//
// L'artisan vient d'émettre un relevé facturable : un document existe, pour une période donnée,
// et la boutique doit le savoir. C'est le message qui dit « on peut facturer, du … au … ».

export type ReleveEmis = {
  boutique: string
  numero: string
  periode_debut: string
  periode_fin: string
  total_ventes: number
  nb_declarations: number
}

export function pushReleveEmis(r: ReleveEmis): Push {
  return {
    title: `${r.boutique} — ton relevé est prêt`,
    body: `Relevé ${r.numero} : ${fmtEuro(r.total_ventes)} sur la période.`,
  }
}

export function mailReleveEmis(r: ReleveEmis, args: { lien: string }): Message {
  const periode = `du ${fmtDateLongue(r.periode_debut)} au ${fmtDateLongue(r.periode_fin)}`
  const texte = [
    'Bonjour,',
    '',
    `Ton relevé facturable pour ${r.boutique} est émis : ${periode}.`,
    '',
    `Montant : ${fmtEuro(r.total_ventes)}, sur ${r.nb_declarations} déclaration${r.nb_declarations > 1 ? 's' : ''} de ventes.`,
    '',
    'Le document est figé : ce qui y figure ne bougera plus, même si une déclaration est',
    'écartée plus tard. Tu peux facturer sur cette base.',
  ]
  if (args.lien) {
    texte.push('', 'Le relevé, dans Braaise :', args.lien)
  }
  texte.push('', 'Pour toute question, réponds simplement à ce mail.')

  const html = mailHtml({
      logo: LOGO_BRAAISE,
    expediteur: 'Braaise',
    titre: `Ton relevé ${r.numero} est prêt`,
    paragraphes: [
      `Relevé facturable pour ${r.boutique}, ${periode} : ${fmtEuro(r.total_ventes)}.`,
      'Le document est figé : ce qui y figure ne bougera plus, même si une déclaration est écartée plus tard.',
    ],
    encadre: {
      lignes: [
        ['Boutique', r.boutique],
        ['Relevé', r.numero],
        ['Du', fmtDateLongue(r.periode_debut)],
        ['Au', fmtDateLongue(r.periode_fin)],
        ['Déclarations', String(r.nb_declarations)],
        ['Montant', fmtEuro(r.total_ventes)],
      ],
    },
    ...(args.lien ? { cta: { libelle: 'Ouvrir le relevé', url: args.lien } } : {}),
    pied: 'Tu reçois ce message parce que Braaise te prévient quand un relevé facturable est émis.',
    resume: `Relevé ${r.numero} émis : ${fmtEuro(r.total_ventes)}, ${periode}.`,
  })

  return {
    subject: `Ton relevé ${r.numero} est prêt — ${fmtEuro(r.total_ventes)}`,
    text: texte.join('\n'),
    html,
  }
}
