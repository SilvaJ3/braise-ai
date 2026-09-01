// Couleurs de l'app, personnalisables depuis Compte. Stockées en local (par appareil).
// ponytail: localStorage, à passer en DB si on veut que le choix suive l'utilisateur entre appareils.
const KEY = 'theme-colors'

export type ThemeColors = { primary: string; secondary: string }

// Valeurs par défaut = celles de index.css (--accent / --accent-soft).
export const DEFAULT_COLORS: ThemeColors = { primary: '#b5451b', secondary: '#fff3e9' }

export function loadColors(): ThemeColors {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_COLORS, ...JSON.parse(raw) }
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
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* pas grave, la couleur est quand même appliquée pour la session */
  }
  applyColors(c)
}
