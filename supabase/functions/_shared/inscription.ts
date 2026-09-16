// Validation de l'inscription : module PUR (aucun accès réseau ni API Deno), donc testable par
// vitest — c'est la seule couche de l'inscription qui est vérifiable automatiquement, l'edge
// function elle-même n'étant couverte par aucun contrôle.

export const MOT_DE_PASSE_MIN = 10
const CODE_MIN = 8
const CODE_MAX = 64
const EMAIL_MAX = 254

// Politique réelle du projet, relevée en interrogeant GoTrue (la config Auth n'est pas lisible
// avec le jeton disponible) : « Password should contain at least one character of each:
// abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789. »
// Notre contrôle doit la couvrir, sinon l'utilisatrice reçoit un message d'erreur anglais.
const CLASSES_REQUISES: { regex: RegExp; quoi: string }[] = [
  { regex: /[a-z]/, quoi: 'une minuscule' },
  { regex: /[A-Z]/, quoi: 'une majuscule' },
  { regex: /[0-9]/, quoi: 'un chiffre' },
]

function liste(éléments: string[]): string {
  if (éléments.length <= 1) return éléments[0] ?? ''
  return `${éléments.slice(0, -1).join(', ')} et ${éléments[éléments.length - 1]}`
}

/** Un code d'invitation se compare sans espaces, sans casse, à ses tirets près. */
export function normaliserCode(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, '').toUpperCase() : ''
}

export function normaliserEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/**
 * Volontairement permissif : on ne valide pas la délivrabilité, seulement la forme. GoTrue
 * refuserait de toute façon une adresse invalide — mais son message d'erreur anglais n'a rien à
 * faire sous les yeux de l'utilisateur.
 */
export function emailInvalide(email: string): string | null {
  if (!email) return 'Indique ton adresse email.'
  if (email.length > EMAIL_MAX) return 'Cette adresse email est trop longue.'
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return "Cette adresse email n'a pas l'air valide."
  return null
}

export function motDePasseInvalide(motDePasse: string, confirmation?: string): string | null {
  if (!motDePasse) return 'Choisis un mot de passe.'
  if (motDePasse.length < MOT_DE_PASSE_MIN) {
    return `Le mot de passe doit faire au moins ${MOT_DE_PASSE_MIN} caractères.`
  }
  if (motDePasse.length > 72) return 'Le mot de passe ne peut pas dépasser 72 caractères.'
  const manquantes = CLASSES_REQUISES.filter((c) => !c.regex.test(motDePasse)).map((c) => c.quoi)
  if (manquantes.length) {
    return `Il manque ${liste(manquantes)} dans le mot de passe (c'est la règle du service, pas la mienne).`
  }
  if (confirmation !== undefined && confirmation !== motDePasse) {
    return 'Les deux mots de passe ne sont pas identiques.'
  }
  return null
}

export function codeInvalide(code: string): string | null {
  if (!code) return "Indique ton code d'invitation."
  if (code.length < CODE_MIN || code.length > CODE_MAX) {
    return "Ce code d'invitation n'a pas l'air complet — vérifie les tirets et les majuscules."
  }
  if (!/^[A-Z0-9-]+$/.test(code)) return "Ce code d'invitation ne contient que des lettres et des chiffres."
  return null
}

/** Premier message d'erreur du formulaire, ou `null` si tout est bon. */
export function erreurFormulaire(valeurs: {
  code: string
  email: string
  motDePasse: string
  confirmation?: string
}): string | null {
  return (
    codeInvalide(valeurs.code) ??
    emailInvalide(valeurs.email) ??
    motDePasseInvalide(valeurs.motDePasse, valeurs.confirmation)
  )
}

// Messages renvoyés par l'edge function : un seul endroit, pour que le front et le serveur ne
// racontent pas deux histoires différentes.
export const MESSAGES = {
  code: "Ce code d'invitation n'est pas valide — il a peut-être déjà servi, ou il a expiré. Demande-m'en un autre.",
  email_pris: 'Cette adresse a déjà un compte : connecte-toi avec, ou demande une réinitialisation.',
  trop_de_tentatives: "Trop de tentatives d'inscription d'affilée. Réessaie dans une heure.",
  champs: "Il manque une information : code d'invitation, email et mot de passe sont nécessaires.",
  erreur: "L'inscription n'a pas abouti (erreur au moment de créer le compte). Réessaie dans un moment.",
  // Repli si le service refuse le mot de passe pour une raison que notre contrôle ne couvre pas
  // (sa politique peut changer sans que le code change) : on ne laisse pas passer l'anglais.
  mot_de_passe_faible:
    'Le mot de passe est refusé : il faut au moins 10 caractères, dont une minuscule, une majuscule et un chiffre.',
} as const
