// Origines autorisées à appeler les fonctions edge depuis un navigateur.
// Toute autre origine (site tiers) est refusée en amont : le CORS `*` ne suffit
// pas à protéger les points d'entrée publics d'un appel déclenché depuis un site
// malveillant (le navigateur joint l'en-tête `Origin`). On refuse donc tôt, avant
// que la réponse `Access-Control-Allow-Origin: *` ne soit émise.
const ORIGINES_AUTORISEES = new Set([
  'https://artisan.braaise.io',
  'https://boutique.braaise.io',
  'https://www.braaise.io',
  'https://braaise.io',
  'http://localhost:5173',
  'http://localhost:4173',
])

export function estOrigineAutorisee(origin: string | null): boolean {
  // Absence d'Origin = appel serveur-à-serveur (cron, Stripe, CLI) : on laisse passer.
  return origin === null || ORIGINES_AUTORISEES.has(origin)
}
