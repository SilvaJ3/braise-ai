// Le mail d'accueil : ce qu'un artisan lit à l'ouverture de son compte.
//
// Trois choses à y trouver, et pas une de plus : comment poser l'app sur son téléphone et
// allumer les notifications (c'est ce qui remplace l'App Store, voir la doctrine PWA), le fichier
// modèle pour charger son catalogue, et ce que l'import consomme. Le reste serait du bavardage.
//
// Forme : le mail se lit en diagonale. Les étapes passent par `sections` (un titre court, une
// ligne), jamais par un paragraphe qui raconte la même chose en six lignes — la version du 07/10
// était une tartine, et personne ne lit une tartine. Le texte brut suit la même numérotation.
//
// Ce que ce mail ne fait PAS, volontairement :
//   · il n'engage aucun prix — le prix est une décision, pas une phrase de mail ;
//   · il ne parle pas de l'avancement du produit — un client lit ce qu'il a, pas le chantier ;
//   · il dit les limites de Braaise (pas de compta, pas de facture) : c'est le produit qui parle.
//
// Texte PUR : aucun accès réseau ni Deno, donc éprouvable sans rien envoyer (voir le .test.ts).
// La mise en page vient de `mail-html.ts`, comme le mail du bon de dépôt.

import { enveloppeJetons, questionsIndicatives } from './enveloppe.ts'
import { mailHtml, type Section } from './mail-html.ts'
import type { Plan } from './compte.ts'

export type MailAccueil = { subject: string; text: string; html: string }

export const NOM_MODELE = 'modele-import-braaise.xlsx'

/**
 * Le réglage qui ARME l'envoi (`reglages_produit.mail_accueil_actif`). Tout ce qui n'est pas
 * exactement « oui » — valeur absente, « non », ligne pas encore posée — laisse le mail éteint.
 * C'est le sens qu'on veut : un envoi vers de vraies personnes ne se déclenche pas par accident,
 * et un déploiement en avance sur la base n'expédie rien.
 */
export function accueilArme(valeur: unknown): boolean {
  return String(valeur ?? '').trim().toLowerCase() === 'oui'
}


export const OBJET_ACCUEIL = 'Votre accès à Braaise — par où commencer'

/** Icône du produit, servie par l'app. Image + texte de remplacement (voir `mail-html.ts`). */
export const LOGO_ACCUEIL = { chemin: '/apple-touch-icon.png', alt: 'Braaise' }

/**
 * Ce que l'enveloppe du mois représente, dit à l'artisan. Le nombre n'est PAS écrit ici : il vient
 * de `enveloppeJetons(plan)`, donc du plan réellement posé — un compte en essai n'a pas le même
 * droit qu'un abonné, et le mail doit dire vrai dans les deux cas.
 */
function phraseEnveloppe(plan: Plan | string | null | undefined): string {
  const questions = questionsIndicatives(enveloppeJetons(plan))
  const debut =
    plan === 'essai'
      ? "Votre essai comprend une enveloppe de calcul, imports compris"
      : 'Votre abonnement donne chaque mois une enveloppe de calcul, imports compris'
  return `${debut} — de l'ordre de ${questions} questions.`
}

const LIMITES =
  'Ce que Braaise ne fait pas, pour que vous ne le cherchiez pas : ni facture, ni comptabilité, ni ' +
  'TVA, ni boutique en ligne. Il soulage l\'atelier et le dépôt-vente ; la comptabilité et les ' +
  'documents officiels restent où ils sont. Le bon de dépôt signé reste la pièce qui compte.'

/**
 * Les trois étapes. Chacune tient en une ligne de titre et deux lignes de texte : c'est la règle
 * de ce mail, et un test la tient (voir `mail-accueil.test.ts`).
 */
function etapes(app: string, enveloppe: string, payant: boolean): Section[] {
  return [
    {
      icone: '📱',
      titre: 'Posez Braaise sur votre téléphone',
      texte:
        "iPhone : « Partager » puis « Sur l'écran d'accueil ». Android : menu ⋮ puis « Ajouter à " +
        "l'écran d'accueil ». Activez les notifications au même endroit — c'est par là que la " +
        'boutique vous parle : un bon confirmé, un réassort demandé.' +
        (app ? '' : ' Le pas-à-pas est dans l\'app, Compte puis « Sur mon téléphone ».'),
    },
    {
      icone: '📊',
      titre: 'Chargez votre catalogue',
      texte:
        `Le fichier joint, ${NOM_MODELE} : une feuille par chose à importer, une ligne par pièce, ` +
        'seule la colonne Nom est obligatoire. Une fois prêt, tout se charge d\'un coup, avec un ' +
        'aperçu avant de confirmer.',
      puces: ['Produits', 'Matières', 'Fournisseurs', 'Boutiques'],
    },
    {
      icone: '⚡',
      titre: 'Ce que ça consomme',
      texte:
        `${enveloppe} Un fichier propre consomme peu ; une photo de liste, davantage. Le reste ` +
        'est visible dans l\'app, sous Mon compte.' +
        (payant ? ' Si l\'enveloppe s\'épuise, un pack de calcul s\'achète si vous le décidez.' : ''),
    },
  ]
}

/**
 * Le mail complet. `appUrl` sans barre finale (le lien de l'app), `plan` celui du compte qui vient
 * de s'ouvrir (il décide du chiffre annoncé).
 */
export function construireMailAccueil(opts: { appUrl: string; plan?: Plan | string | null }): MailAccueil {
  const app = String(opts.appUrl ?? '').replace(/\/+$/, '')
  const plan = opts.plan ?? null
  const payant = plan !== 'essai'

  const accroche = 'Bonjour, votre compte est ouvert. Trois choses, et vous travaillez.'
  const sections = etapes(app, phraseEnveloppe(plan), payant)

  // Version brute : la source, toujours envoyée. Le lien y est écrit en clair, et les étapes
  // suivent la même numérotation que la version mise en page.
  const brutEtapes = sections
    .map((s, i) =>
      [
        `☐ ${i + 1}. ${s.titre}`,
        ...(i === 0 && app ? [app] : []),
        s.texte,
        ...(s.puces?.length ? [`À importer : ${s.puces.join(', ').toLowerCase()}.`] : []),
      ].join('\n'),
    )
    .join('\n\n')

  const text =
    `${accroche}\n\n${brutEtapes}\n\n${LIMITES}\n\nBonne mise en route,\nBraaise\n\n—\n` +
    'Vous recevez ce message parce qu\'un compte Braaise vient d\'être ouvert avec cette adresse. ' +
    'Une question : contact@braaise.io\n'

  const html = mailHtml({
    expediteur: 'Braaise',
    titre: 'Votre accès à Braaise',
    resume: 'Trois choses pour commencer : l\'app sur le téléphone, le fichier d\'import, ce que ça consomme.',
    paragraphes: [accroche],
    sections,
    logo: app ? { url: `${app}${LOGO_ACCUEIL.chemin}`, alt: LOGO_ACCUEIL.alt } : undefined,
    cta: app ? { libelle: 'Ouvrir Braaise', url: app } : undefined,
    note: LIMITES,
    pied:
      'Vous recevez ce message parce qu\'un compte Braaise vient d\'être ouvert avec cette adresse. ' +
      'Une question : contact@braaise.io',
  })

  return { subject: OBJET_ACCUEIL, text, html }
}
