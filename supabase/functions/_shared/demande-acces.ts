// Demandes d'accès, côté texte : normalisation, jeton, mails et pages de confirmation.
//
// Tout ce qui peut être écrit sans réseau ni base vit ici, pour être testable (`npm run check`)
// et pour que le handler reste court : il lit, écrit, envoie.
//
// Deux mails partent de ce flux, et un seul parle à un inconnu :
//  1. la notification à l'administrateur (avec le jeton de validation) ;
//  2. l'invitation à la personne, **seulement** après le clic de validation.

import type { MailMise } from './mail-html.ts'

export const MESSAGES_DEMANDE = {
  email: "Cette adresse email n'a pas l'air complète — vérifie-la.",
  trop: 'Trop de demandes envoyées d\'affilée. Réessaie dans une heure, ou écris-moi directement.',
  erreur: "Ça n'est pas passé de mon côté — réessaie dans un instant.",
  ok: "C'est noté, tu auras une réponse par mail.",
} as const

/** Un champ texte venu d'un formulaire : chaîne sûre, une seule ligne, longueur bornée. */
export function champTexte(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const propre = v.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!propre) return null
  return propre.slice(0, max)
}

/** Email normalisé : minuscules, espaces retirés (l'email est la clé de comparaison). */
export function normaliserEmailDemande(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/**
 * Volontairement permissif : on refuse ce qui ne peut pas être une adresse, pas ce qui sort de
 * l'ordinaire. Un faux positif ici ferme la porte à quelqu'un de bonne foi.
 */
export function emailDemandeInvalide(email: string): string | null {
  if (!email) return "Il manque ton adresse email."
  if (email.length > 254) return MESSAGES_DEMANDE.email
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return MESSAGES_DEMANDE.email
  return null
}

/**
 * Jeton de validation : 128 bits en hexadécimal. Il ne circule que par mail vers
 * l'administrateur, et il est à usage unique — 32 caractères tirés au hasard suffisent.
 */
export function jeton(): string {
  const octets = new Uint8Array(16)
  globalThis.crypto.getRandomValues(octets)
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('')
}

/**
 * Destinataires des notifications : une ou plusieurs adresses, séparées par une virgule ou un
 * point-virgule. Plusieurs adresses servent à ne rien perdre pendant qu'une boîte se met en
 * place — et on envoie à toutes, jamais à une seule au hasard.
 */
export function destinatairesAdmin(valeur: string): string[] {
  const vues = new Set<string>()
  for (const brut of valeur.split(/[,;]/)) {
    const adresse = normaliserEmailDemande(brut)
    if (!adresse || emailDemandeInvalide(adresse)) continue
    vues.add(adresse)
  }
  return [...vues]
}

export type DemandeRecue = {
  email: string
  atelier: string | null
  message: string | null
}

/** Date lisible dans un mail, en heure de Bruxelles (les demandes arrivent du monde réel). */
export function dateLisible(iso: string): string {
  const d = new Date(iso)
  const quand = new Intl.DateTimeFormat('fr-BE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Brussels',
  }).format(d)
  return quand
}

export function sujetNotification(email: string): string {
  return `[Braaise] Demande d'accès — ${email}`
}

export type MailTexte = { subject: string; text: string; mise: MailMise }

/** Mail à l'administrateur : qui demande, et le lien qui ouvre la page de validation. */
export function mailNotification(
  d: DemandeRecue & { lien: string; recueLe: string; ip: string | null; dejaCompte: boolean },
): MailTexte {
  const lignes = [
    `${d.email} demande un accès à Braaise.`,
    d.atelier ? `Atelier : ${d.atelier}` : null,
    d.message ? `Message : « ${d.message} »` : null,
    '',
    d.dejaCompte
      ? "Attention : cette adresse a déjà un compte. Réponds-lui directement plutôt que de lui envoyer une invitation."
      : "Pour valider et lui envoyer son invitation :",
    d.dejaCompte ? null : d.lien,
    '',
    d.dejaCompte
      ? null
      : "Le lien ouvre une page de confirmation — rien ne part avant que tu cliques sur le bouton.",
    `Reçue le ${d.recueLe}${d.ip ? ` (${d.ip})` : ''}.`,
  ]

  const details: [string, string][] = [['Email', d.email]]
  if (d.atelier) details.push(['Atelier', d.atelier])
  if (d.message) details.push(['Message', `« ${d.message} »`])
  details.push(['Reçue le', d.recueLe])

  return {
    subject: sujetNotification(d.email),
    text: lignes.filter((l): l is string => l !== null).join('\n'),
    mise: {
      expediteur: 'Braaise',
      titre: "Nouvelle demande d'accès",
      paragraphes: [
        "Quelqu'un demande un accès à Braaise depuis le site.",
        d.dejaCompte
          ? "Cette adresse a déjà un compte : à toi de juger si c'est la même personne."
          : "Valide la demande pour créer son invitation et la lui envoyer.",
      ],
      encadre: { lignes: details },
      ...(d.dejaCompte
        ? { note: `Réponds directement à ${d.email} : lui envoyer une invitation n'aurait pas de sens.` }
        : {
            cta: { libelle: 'Ouvrir la demande', url: d.lien },
            note: 'Le lien ouvre une page de confirmation — rien ne part avant que tu cliques.',
          }),
      pied: 'Braaise — notification interne.',
      resume: `${d.email} demande un accès à Braaise.`,
    },
  }
}

/** Mail d'invitation : le lien porte le code, donc la personne n'a rien à recopier. */
export function mailInvitation(
  d: { email: string; code: string; lien: string; validiteJours: number },
): MailTexte {
  return {
    subject: 'Ton invitation à Braaise',
    text: [
      'Bonjour,',
      '',
      "Ta demande d'accès est validée — voici ton invitation.",
      '',
      'Crée ton compte en cliquant sur ce lien :',
      d.lien,
      '',
      "Le code d'invitation y est déjà rempli : il te reste à choisir un mot de passe.",
      `Ce lien vaut ${d.validiteJours} jours et ne sert qu'une fois.`,
      '',
      "Si tu n'es pas à l'origine de cette demande, tu peux ignorer ce message.",
      '',
      '— Braaise',
    ].join('\n'),
    mise: {
      expediteur: 'Braaise',
      titre: 'Ton invitation à Braaise',
      paragraphes: [
        "Ta demande d'accès est validée — bienvenue.",
        "Pour commencer, crée ton compte : ton code d'invitation est déjà rempli, il te reste à choisir un mot de passe.",
      ],
      cta: { libelle: 'Créer mon compte', url: d.lien },
      encadre: {
        lignes: [
          ["Code d'invitation", d.code],
          ['Validité', `${d.validiteJours} jours, une seule fois`],
        ],
      },
      note: "Si tu n'es pas à l'origine de cette demande, tu peux ignorer ce message.",
      pied: 'Braaise — l’assistant des artisans qui vendent en boutiques. Réponds à ce mail si tu as une question.',
      resume: 'Ton invitation : ton compte t’attend, le code est déjà rempli.',
    },
  }
}

/**
 * La page de validation ne vit pas ici. Une edge function Supabase ne peut pas servir de HTML :
 * la passerelle réécrit l'en-tête en `text/plain` et impose un CSP `sandbox` — le navigateur
 * affiche alors la source au lieu de la page (constaté en production le 19/09). Elle vit donc
 * sur le site (`braaise.io/acces`), et la fonction ne rend que **des données**.
 */
export type EtatDemande = 'nouvelle' | 'deja_traitee' | 'inconnu'

/** Ce que la page de validation reçoit pour afficher la demande et permettre de décider. */
export type VueDemande = {
  etat: EtatDemande
  email?: string
  atelier?: string | null
  message?: string | null
  recueLe?: string
  /** Vrai si l'adresse a déjà un compte : avertir, jamais décider à la place de l'admin. */
  dejaCompte?: boolean
}

/** Ce que la fonction répond après un clic. La page en tire le texte à afficher. */
export type ResultatValidation =
  | { cas: 'validee'; email: string; code: string }
  | { cas: 'refusee'; email: string }
  | { cas: 'deja_traitee' }
  | { cas: 'jeton_inconnu' }
  | { cas: 'erreur' }
