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

/** Échappe ce qui vient de l'extérieur avant de le poser dans une page HTML. */
export function echapperHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

/** Enveloppe commune des pages servies par la fonction : sobres, sans ressource externe. */
function page(titre: string, corps: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${echapperHtml(titre)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #f6f3ee; color: #2b2b2b;
         font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 34rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
  h1 { font-size: 1.35rem; margin: 0 0 .4rem; }
  .carte { background: #fff; border: 1px solid #e3ddd4; border-radius: 14px; padding: 1.25rem 1.25rem 1.5rem; }
  dl { margin: .75rem 0 0; }
  dt { font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; color: #7a736a; }
  dd { margin: .1rem 0 .8rem; }
  .actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: 1.25rem; }
  button { font: inherit; padding: .6rem 1rem; border-radius: 10px; cursor: pointer; }
  .valider { background: #4a7396; color: #fff; border: 1px solid #4a7396; }
  .refuser { background: #fff; color: #2b2b2b; border: 1px solid #cbc3b8; }
  .note { color: #6f6861; font-size: .88rem; margin-top: 1rem; }
  .muted { color: #6f6861; }
</style>
</head>
<body>
<main>
${corps}
</main>
</body>
</html>`
}

const P = (v: string) => `<p>${v}</p>`

/** Page de confirmation : elle n'agit pas, elle demande. */
export function pageValidation(
  d: DemandeRecue & { jeton: string; recueLe: string; dejaCompte?: boolean },
): { statut: number; html: string } {
  const lignes = [
    `<dt>Email</dt><dd>${echapperHtml(d.email)}</dd>`,
    d.atelier ? `<dt>Atelier</dt><dd>${echapperHtml(d.atelier)}</dd>` : '',
    d.message ? `<dt>Message</dt><dd>${echapperHtml(`« ${d.message} »`)}</dd>` : '',
    `<dt>Reçue le</dt><dd>${echapperHtml(d.recueLe)}</dd>`,
  ].join('')

  // Avertir, pas décider : si un compte existe déjà, c'est à l'administrateur de juger — il
  // sait s'il s'agit de la même personne (une seconde adresse, un essai) ou pas.
  const avertissement = d.dejaCompte
    ? `<p class="note" style="color:#8a5a1e">Cette adresse a déjà un compte Braaise. Lui envoyer
       une invitation n'a d'intérêt que si c'est une autre personne.</p>`
    : ''

  const corps = `
<h1>Demande d'accès</h1>
<div class="carte">
  <p class="muted" style="margin-top:0">Rien n'est envoyé tant que tu n'as pas cliqué.</p>
  <dl>${lignes}</dl>
  ${avertissement}
  <form method="post" class="actions">
    <button class="valider" type="submit" name="action" value="valider">Envoyer l'invitation</button>
    <button class="refuser" type="submit" name="action" value="refuser">Refuser</button>
  </form>
  <p class="note">Valider crée un code d'invitation nominatif et envoie le lien à cette adresse.</p>
</div>`
  return { statut: 200, html: page("Demande d'accès — Braaise", corps) }
}

export type Suite =
  | { cas: 'validee'; email: string; code: string }
  | { cas: 'refusee'; email: string }
  | { cas: 'deja_traitee' }
  | { cas: 'jeton_inconnu' }
  | { cas: 'erreur' }

/** Page finale : elle dit ce qui vient de se passer, et ne propose plus rien. */
export function pageSuite(s: Suite): { statut: number; html: string } {
  let titre: string
  let corps: string
  switch (s.cas) {
    case 'validee':
      titre = 'Invitation envoyée'
      corps =
        P(`L'invitation part à <strong>${echapperHtml(s.email)}</strong>.`) +
        P(`Code créé : <code>${echapperHtml(s.code)}</code>. Il attend la personne dans son mail.`)
      break
    case 'refusee':
      titre = 'Demande refusée'
      corps =
        P(`Rien n'a été envoyé à <strong>${echapperHtml(s.email)}</strong>.`) +
        P('Si tu veux lui répondre toi-même, son adresse est dans le mail de notification.')
      break
    case 'deja_traitee':
      titre = 'Déjà traité'
      corps = P('Cette demande a déjà été validée ou refusée : aucun second envoi.')
      break
    case 'jeton_inconnu':
      titre = 'Lien expiré'
      corps =
        P('Ce lien ne correspond plus à une demande en attente — il a déjà servi.') +
        P('Tu peux retrouver les demandes dans la table <code>demandes_acces</code>.')
      break
    case 'erreur':
      titre = "Ça n'est pas passé"
      corps =
        P("Quelque chose a échoué de mon côté : la demande est intacte, rien n'a été envoyé.") +
        P('Réessaie dans un instant.')
      break
  }

  return {
    statut: s.cas === 'erreur' ? 500 : 200,
    html: page(`${titre} — Braaise`, `<h1>${titre}</h1><div class="carte">${corps}</div>`),
  }
}
