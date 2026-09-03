// Couleurs de l'app, personnalisables depuis Compte. Stockées en local (par appareil).
// ponytail: localStorage, à passer en DB si on veut que le choix suive l'utilisateur entre appareils.
const KEY = 'theme-colors'

export type ThemeColors = { primary: string; secondary: string }

// Valeurs par défaut = celles de index.css (--accent / --accent-soft).
export const DEFAULT_COLORS: ThemeColors = { primary: '#b5451b', secondary: '#fff3e9' }

const HEX = /^#[0-9a-f]{6}$/i

// Seules des couleurs hex valides sont acceptées : ce qui est injecté dans une variable CSS
// vient du localStorage, qu'on ne contrôle pas totalement.
export function sanitizeColors(raw: unknown): ThemeColors {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pick = (k: keyof ThemeColors) =>
    typeof o[k] === 'string' && HEX.test(o[k] as string) ? (o[k] as string).toLowerCase() : DEFAULT_COLORS[k]
  return { primary: pick('primary'), secondary: pick('secondary') }
}

export function loadColors(): ThemeColors {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return sanitizeColors(JSON.parse(raw))
  } catch {
    /* localStorage indisponible ou JSON cassé : on retombe sur le défaut */
  }
  return DEFAULT_COLORS
}

export function applyColors(c: ThemeColors) {
  const s = document.documentElement.style
  s.setProperty('--accent', c.primary)
  s.setProperty('--accent-soft', c.secondary)
}

export function saveColors(c: ThemeColors) {
  const safe = sanitizeColors(c)
  try {
    localStorage.setItem(KEY, JSON.stringify(safe))
  } catch {
    /* pas grave, la couleur est quand même appliquée pour la session */
  }
  applyColors(safe)
}
