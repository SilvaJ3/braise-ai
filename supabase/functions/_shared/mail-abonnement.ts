// Les mails de l'abonnement : ce qu'on écrit à un artisan avant de lui prélever quelque chose.
//
// Quatre envois, et un seul principe : AUCUN n'annonce une mauvaise surprise. Deux préviennent avant
// le premier prélèvement (deux jours avant, puis la veille), deux suivent un prélèvement refusé, et
// un dernier annonce la reconduction de l'abonnement à l'année. La personne doit pouvoir arrêter
// sans avoir à chercher comment, et sans avoir à nous écrire.
//
// Ce que ces mails disent toujours : le montant réel (HTVA et TVA comprise), la date, et le geste
// exact pour arrêter. Ce qu'ils ne disent jamais : « dernière chance » sans dire ce qui se passe
// ensuite, ni qu'un accès est perdu quand il ne l'est pas.
//
// Le texte vit ici, en TypeScript pur : il se vérifie sans base et sans réseau (voir le test).
// L'envoi, lui, est dans la fonction `abonnement-rappels`.

import { euros } from './stripe.ts'
import { mailHtml } from './mail-html.ts'

/** Le taux appliqué par Stripe Tax en Belgique : 21 %. Sert à écrire le TTC à côté du HTVA. */
const TAUX_TVA = 0.21

export type MailAbonnement = { subject: string; text: string; html: string }

/** Ce dont les trois mails ont besoin, et rien de plus : tout est passé par l'appelant. */
export type Situation = {
  /** Nom affiché en en-tête. */
  expediteur: string
  /** Adresse de l'application : c'est elle qui porte le bouton. */
  urlApp: string
  /** Le montant HTVA en centimes, tel qu'il sera prélevé. */
  montantCentimes: number
  frequence: 'mois' | 'an'
}

/** Le montant TVA comprise, en centimes. Arrondi au centime, comme la facture. */
export function montantTtc(centimes: number): number {
  return Math.round(centimes * (1 + TAUX_TVA))
}

/**
 * Une date lisible, au jour près, en heure de Bruxelles : « 12 octobre 2026 ». Un prélèvement
 * annoncé au mauvais jour est pire que pas de prélèvement annoncé du tout — d'où le fuseau fixé
 * plutôt que celui de la machine, et d'où l'arrondi au jour (le mail est envoyé la veille au soir).
 */
export function dateLisible(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('fr-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Brussels',
  }).format(d)
}

/** « 39 € HTVA par mois, soit 47,19 € TVA comprise » — la formule du prix, écrite une seule fois. */
export function prixDit(centimes: number, frequence: 'mois' | 'an'): string {
  const htva = euros(centimes) ?? ''
  const ttc = euros(montantTtc(centimes)) ?? ''
  const duree = frequence === 'an' ? 'par an' : 'par mois'
  return `${htva} HTVA ${duree}, soit ${ttc} TVA comprise (21 %)`
}

function lienCompte(urlApp: string): string {
  return `${urlApp.replace(/\/+$/, '')}/compte/mon-compte`
}

const PIED = 'Tu reçois ce mail parce que tu as un compte Braaise. Il ne part qu\'aux étapes de ton abonnement.'

/**
 * Le rappel avant la fin de l'essai. Part deux jours avant, puis la veille — le même texte, à un
 * jour près, parce que c'est le même message : voilà ce qui se passe, voilà comment l'arrêter.
 */
export function mailEssaiBientot(s: Situation & { jours: number; finLe: string }): MailAbonnement {
  const fin = dateLisible(s.finLe)
  const jours = s.jours > 1 ? `${s.jours} jours` : 'la journée'
  const titre = s.jours > 1 ? `Ton essai se termine dans ${jours}` : 'Ton essai se termine demain'

  const p1 = `Ton essai de Braaise se termine le ${fin}. C'est aussi le jour du premier prélèvement : ${prixDit(s.montantCentimes, s.frequence)}.`
  const p2 = `Si tu ne veux pas continuer, arrête-le depuis « Mon compte » avant cette date : rien ne sera prélevé, et tu gardes l'accès jusqu'au bout des sept jours.`
  const p3 = `Sinon, l'abonnement démarre le ${fin} et se résilie à tout moment ensuite — il reste actif jusqu'à la fin de la période payée.`

  const text = [titre, '', p1, '', p2, '', p3, '', `Mon compte : ${lienCompte(s.urlApp)}`, '', PIED].join('\n')

  return {
    subject: titre,
    text,
    html: mailHtml({
      expediteur: s.expediteur,
      titre,
      paragraphes: [p1, p2, p3],
      encadre: {
        lignes: [
          ['Fin de l’essai', fin],
          ['Premier prélèvement', euros(montantTtc(s.montantCentimes)) ?? ''],
          ['Abonnement', `${euros(s.montantCentimes) ?? ''} HTVA ${s.frequence === 'an' ? 'par an' : 'par mois'}`],
        ],
      },
      cta: { libelle: 'Ouvrir mon compte', url: lienCompte(s.urlApp) },
      note: 'Aucun prélèvement n’a lieu avant cette date.',
      pied: PIED,
    }),
  }
}

/**
 * Le prélèvement refusé. Trois envois au maximum, et le dernier dit ce qui se passe ensuite : une
 * semaine après, l'accès se met en pause. Ce qui reste lisible est dit aussi — les dépôts, le
 * planning, les données ne partent pas.
 */
export function mailImpaye(s: Situation & { relance: number }): MailAbonnement {
  const derniere = s.relance >= 3
  const montant = prixDit(s.montantCentimes, s.frequence)
  const titre = derniere
    ? 'Dernier rappel : ton abonnement va se mettre en pause'
    : 'Nous n’avons pas pu prélever ton abonnement'

  const p1 = `Le prélèvement de ${montant} n'est pas passé. Ton accès reste ouvert — rien ne s'est arrêté pour l'instant.`
  const p2 = `C'est souvent une carte arrivée à échéance, ou une validation demandée par ta banque. Tu peux mettre ton moyen de paiement à jour depuis « Mon compte ».`
  const p3 = derniere
    ? `Sans paiement de ta part, l'accès à l'atelier se met en pause une semaine après ce mail : l'assistant, les imports et les nouveaux bons de dépôt s'arrêtent. Tes dépôts, ton planning et tes données restent lisibles, et tout repart dès qu'une carte à jour est enregistrée.`
    : `Nous réessaierons dans quelques jours. Aucune action n'est nécessaire si ta banque valide le paiement.`

  const text = [titre, '', p1, '', p2, '', p3, '', `Mon compte : ${lienCompte(s.urlApp)}`, '', PIED].join('\n')

  return {
    subject: titre,
    text,
    html: mailHtml({
      expediteur: s.expediteur,
      titre,
      paragraphes: [p1, p2, p3],
      encadre: {
        lignes: [
          ['Montant', montant],
          ['Relance', `${s.relance} sur 3`],
        ],
      },
      cta: { libelle: 'Mettre à jour mon moyen de paiement', url: lienCompte(s.urlApp) },
      note: derniere ? 'L’accès se met en pause une semaine après ce mail.' : 'Ton accès reste ouvert.',
      pied: PIED,
    }),
  }
}

/**
 * La reconduction de l'abonnement à l'année, annoncée au plus tard quinze jours avant. Le mensuel
 * sans engagement n'a pas ce mail : rien ne s'y reconduit sans qu'on l'ait dit.
 */
export function mailAvisRenouvellement(s: Situation & { finLe: string }): MailAbonnement {
  const fin = dateLisible(s.finLe)
  const titre = `Ton abonnement se renouvelle le ${fin}`

  const p1 = `Ton abonnement Braaise à l'année se renouvelle le ${fin} : ${prixDit(s.montantCentimes, s.frequence)}, pour une nouvelle année.`
  const p2 = `Si tu ne veux pas le renouveler, arrête-le depuis « Mon compte » avant cette date : il restera actif jusqu'à la fin de l'année en cours, et rien d'autre ne sera prélevé.`
  const p3 = `Après la reconduction, tu peux encore résilier à tout moment, sans frais.`

  const text = [titre, '', p1, '', p2, '', p3, '', `Mon compte : ${lienCompte(s.urlApp)}`, '', PIED].join('\n')

  return {
    subject: titre,
    text,
    html: mailHtml({
      expediteur: s.expediteur,
      titre,
      paragraphes: [p1, p2, p3],
      encadre: {
        lignes: [
          ['Reconduction', fin],
          ['Montant', prixDit(s.montantCentimes, s.frequence)],
        ],
      },
      cta: { libelle: 'Gérer mon abonnement', url: lienCompte(s.urlApp) },
      note: 'Tu peux arrêter à tout moment, sans frais.',
      pied: PIED,
    }),
  }
}
