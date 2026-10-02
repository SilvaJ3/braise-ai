// Le mail d'accueil : ce qu'un artisan reçoit à l'ouverture de son compte.
//
// POURQUOI CE FICHIER EXISTE. Jusqu'ici l'inscription créait le compte côté serveur sans qu'aucun
// mail ne parte : l'artisan avait un accès qu'il ne pouvait pas retrouver, et le modèle d'import
// n'était nulle part. C'est le premier trou du parcours d'entrée (l'autre étant « mot de passe
// oublié »). Le compte doit pouvoir revenir : le lien de l'app est donc dans le corps, et le
// classeur d'import est joint.
//
// MÊME FORME QUE `mail-bon.ts` : le texte et le gabarit vivent ici, en TypeScript PUR (aucun accès
// réseau, aucun `Deno`) pour être vérifiables sans base ni envoi. L'envoi, lui, est dans la fonction
// `inscription`, qui ne fait que porter ce que ce module a composé.
//
// DOCTRINE (voir BRAISE-POSITIONNEMENT.md) : on parle aux artisans au masculin pluriel neutre, on
// dit les limites du produit (« ni facture, ni comptabilité, ni TVA, ni boutique en ligne »), on ne
// promet ni date ni prix du chantier. Le lien de l'app n'est JAMAIS écrit en dur : il vient d'un
// paramètre (l'appelant lit `APP_URL` / `reglages_produit.app_url`).

import { mailHtml } from './mail-html.ts'
import type { Piece } from './mailer.ts'
import { MODELE_IMPORT_BASE64, MODELE_IMPORT_NOM } from './modele-import.ts'

export type MailAccueil = {
  subject: string
  text: string
  html: string
  attachments: Piece[]
}

/** L'objet, écrit une seule fois : les tests et la fonction d'envoi le lisent ici. */
export const OBJET_ACCUEIL = 'Votre accès à Braaise — par où commencer'

/** Le libellé du bouton dans la version HTML. */
export const LIBELLE_BOUTON_ACCUEIL = "Ouvrir l'app"

/** Ce que Braaise ne fait pas, dit en clair : c'est la première question d'un artisan. */
export const LIMITES_ACCUEIL =
  'Ce que Braaise ne fait pas, pour que vous ne le cherchiez pas : ni facture, ni comptabilité, ni TVA, ni boutique en ligne. Il soulage l’atelier et le dépôt-vente ; la comptabilité et les documents officiels restent où ils sont. Le bon de dépôt signé reste la pièce qui compte.'

/** Le pied de page, dans les deux versions : pourquoi ce mail, et à qui répondre. */
export const PIED_ACCUEIL =
  'Vous recevez ce mail parce que votre accès Braaise vient d’être ouvert. Pour toute question, répondez simplement à ce message.'

/**
 * L'adresse de l'application, normalisée : on retire une barre oblique finale pour ne jamais
 * écrire `//` au milieu d'un lien. Une adresse vide est une erreur d'appel — pas un lien muet :
 * un mail d'accueil sans lien ne sert à rien, donc on refuse de le composer.
 */
export function lienApp(urlApp: string): string {
  const base = String(urlApp ?? '').trim().replace(/\/+$/, '')
  if (!base) throw new Error("l'adresse de l'application (urlApp) est requise")
  return base
}

/** La signature : le prénom de l'expéditeur s'il est connu, sinon le nom du produit. */
function signature(prenom?: string): string {
  const p = String(prenom ?? '').trim()
  return p ? `${p}, Braaise` : 'Braaise'
}

/**
 * Compose le mail complet. `urlApp` est l'adresse de l'application (par exemple
 * `https://artisan.braaise.io`) ; `prenom` est la signature, facultative.
 *
 * La pièce jointe est le modèle d'import, embarqué en base64 (voir `modele-import.ts`) : un artisan
 * sans catalogue doit pouvoir le remplir dès le premier jour.
 */
export function construireMailAccueil(options: { urlApp: string; prenom?: string }): MailAccueil {
  const lien = lienApp(options.urlApp)

  const intro = 'Votre accès à Braaise est ouvert. Trois choses, et vous êtes en marche.'
  const t1 = '1. Ouvrez l’app et posez-la sur votre écran d’accueil.'
  const t1b = `Sur iPhone : « Partager » → « Sur l’écran d’accueil ». Sur Android : menu ⋮ → « Ajouter à l’écran d’accueil ». Le pas-à-pas détaillé est dans l’app, Compte → Sur mon téléphone. Activez les notifications au même endroit : c’est par là que vous saurez qu’une boutique a confirmé un bon ou demandé un réassort.`
  const t2 = '2. Votre catalogue : le fichier joint.'
  const t2b = `${MODELE_IMPORT_NOM} contient une feuille par chose à importer — Produits, Matières, Fournisseurs, Boutiques. Une ligne par pièce, seule la colonne Nom est obligatoire, et les autres colonnes s’expliquent dans le fichier. Ne cherchez pas à tout remplir d’un coup : ce fichier vous sert toute l’année. Chaque ajout se charge dans l’app en une fois (Atelier → Importer), avec un aperçu avant de confirmer — rien n’entre en base sans votre accord.`
  const t2c = 'Une précaution : n’ajoutez ni titre, ni total, ni feuille d’exemples dans le fichier. Tout ce qui traîne peut être lu comme une donnée à importer.'
  const t3 = '3. Ce que ça consomme.'
  const t3b = `Votre abonnement donne chaque mois une enveloppe de calcul, imports compris — l’ordre de grandeur d’environ 300 questions, ou une centaine de fichiers remplis avec ce modèle. Un fichier propre consomme peu ; une photo de liste, un PDF ou un export en désordre consomme davantage, parce qu’il faut le relire et deviner ce qu’il contient.`
  const t3c = 'Le compte est dans l’app, sous Mon compte : vous voyez où vous en êtes et ce qui reste. Si l’enveloppe du mois s’épuise, un pack de calcul s’achète sans changer d’abonnement. Le choix reste le vôtre, l’app ne l’achète jamais à votre place.'
  const fin = `Bonne mise en route,\n${signature(options.prenom)}`

  // Version brute : toujours envoyée, et c'est elle qui porte les liens quand le HTML est refusé.
  // Le lien de l'app est seul sur sa ligne, pour qu'un lecteur de messages le reconnaisse.
  const text = [
    'Bonjour,',
    '',
    intro,
    '',
    t1,
    lien,
    t1b,
    '',
    t2,
    t2b,
    t2c,
    '',
    t3,
    t3b,
    t3c,
    '',
    LIMITES_ACCUEIL,
    '',
    fin,
    '',
    PIED_ACCUEIL,
  ].join('\n')

  const html = mailHtml({
    expediteur: 'Braaise',
    titre: 'Votre accès à Braaise',
    paragraphes: [intro, t1, t1b, t2, t2b, t2c, t3, t3b, t3c, LIMITES_ACCUEIL],
    cta: { libelle: LIBELLE_BOUTON_ACCUEIL, url: lien },
    note: 'Le modèle d’import est en pièce jointe.',
    pied: PIED_ACCUEIL,
    resume: 'Votre accès est ouvert — le lien de l’app et le modèle d’import.',
  })

  return {
    subject: OBJET_ACCUEIL,
    text,
    html,
    attachments: [{ filename: MODELE_IMPORT_NOM, base64: MODELE_IMPORT_BASE64 }],
  }
}
