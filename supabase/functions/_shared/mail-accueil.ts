// Le mail d'accueil : ce qu'un artisan lit à l'ouverture de son compte.
//
// Trois choses à y trouver, et pas une de plus : comment poser l'app sur son téléphone et
// allumer les notifications (c'est ce qui remplace l'App Store, voir la doctrine PWA), le fichier
// modèle pour charger son catalogue, et ce que l'import consomme. Le reste serait du bavardage.
//
// Ce que ce mail ne fait PAS, volontairement :
//   · il n'engage aucun prix — le prix est une décision, pas une phrase de mail ;
//   · il ne parle pas de l'avancement du produit — un client lit ce qu'il a, pas le chantier ;
//   · il dit les limites de Braaise (pas de compta, pas de facture) : c'est le produit qui parle.
//
// Texte PUR : aucun accès réseau ni Deno, donc éprouvable sans rien envoyer (voir le .test.ts).
// La mise en page vient de `mail-html.ts`, comme le mail du bon de dépôt.

import { enveloppeJetons, questionsIndicatives } from './enveloppe.ts'
import { mailHtml } from './mail-html.ts'
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

const PRECAUTION_FICHIER =
  'Une précaution : n\'ajoutez ni titre, ni total, ni feuille d\'exemples dans le fichier. Tout ce ' +
  'qui traîne dedans peut être lu comme une donnée à importer.'

/**
 * Le mail complet. `appUrl` sans barre finale (le lien de l'app), `plan` celui du compte qui vient
 * de s'ouvrir (il décide du chiffre annoncé).
 */
export function construireMailAccueil(opts: { appUrl: string; plan?: Plan | string | null }): MailAccueil {
  const app = String(opts.appUrl ?? '').replace(/\/+$/, '')
  const plan = opts.plan ?? null
  const payant = plan !== 'essai'

  const paragraphes = [
    'Bonjour,',
    "Votre accès à Braaise est ouvert.",
    `1. Ouvrez l'app et posez-la sur votre écran d'accueil : ${app}\n` +
      'Sur iPhone : « Partager » puis « Sur l\'écran d\'accueil ». Sur Android : menu ⋮ puis ' +
      '« Ajouter à l\'écran d\'accueil ». Le pas-à-pas est dans l\'app, Compte puis « Sur mon ' +
      'téléphone ». Activez les notifications au même endroit : c\'est par là que vous saurez ' +
      'qu\'une boutique a confirmé un bon ou demandé un réassort.',
    `2. Vos produits, vos matières, vos fournisseurs, vos boutiques : le fichier joint, ${NOM_MODELE}.\n` +
      'Il contient une feuille par chose à importer. Une ligne par pièce, seule la colonne Nom est ' +
      'obligatoire, et les autres colonnes s\'expliquent dans le fichier. Vous n\'avez pas à tout ' +
      'remplir d\'un coup : ce fichier vous sert toute l\'année. Chaque ajout se charge dans ' +
      'l\'app en une fois (Atelier, puis Importer), avec un aperçu avant de confirmer — rien ' +
      'n\'entre en base sans votre accord.',
    PRECAUTION_FICHIER,
    `3. Ce que ça consomme. ${phraseEnveloppe(plan)} Un fichier propre et rempli avec ce modèle ` +
      'consomme peu ; une photo de liste ou un PDF en désordre consomme davantage, parce qu\'il ' +
      'faut le relire et deviner ce qu\'il contient. Le compte est dans l\'app, sous Mon compte : ' +
      'vous voyez ce qui reste.' +
      (payant
        ? ' Si l\'enveloppe du mois s\'épuise, un pack de calcul s\'achète sans changer ' +
          'd\'abonnement. Le choix reste le vôtre, l\'app ne l\'achète jamais à votre place.'
        : ''),
    LIMITES,
    'Bonne mise en route,\nBraaise',
  ]

  // Version brute : la source, toujours envoyée. Le lien y est écrit en clair, et les étapes
  // suivent la même numérotation que la version mise en page.
  const text = `${paragraphes.join('\n\n')}\n\n—\n` +
    'Vous recevez ce message parce qu\'un compte Braaise vient d\'être ouvert avec cette adresse. ' +
    'Une question : contact@braaise.io\n'

  const html = mailHtml({
    expediteur: 'Braaise',
    titre: "Votre accès à Braaise",
    resume: 'Trois choses pour commencer : l\'app sur le téléphone, le fichier d\'import, ce que ça consomme.',
    paragraphes,
    cta: app ? { libelle: 'Ouvrir Braaise', url: app } : undefined,
    pied:
      'Vous recevez ce message parce qu\'un compte Braaise vient d\'être ouvert avec cette adresse. ' +
      'Une question : contact@braaise.io',
  })

  return { subject: OBJET_ACCUEIL, text, html }
}
