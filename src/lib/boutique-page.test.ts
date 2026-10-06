import { describe, expect, it } from 'vitest'
import page from '../../public/boutique/index.html?raw'
import vercelBrut from '../../vercel.json?raw'

// La page publique /boutique/<jeton> est servie sur la même origine que l'app : une désignation
// ou un nom d'atelier écrit par un artisan qui y serait injecté tel quel pourrait lire les sessions.
// Chaque donnée venue de la base doit passer par echapper() avant d'entrer dans un gabarit.

const CHAMPS = ['designation', 'artisan', 'boutique', 'numero', 'cle', 'nom']

// Sûrs, et vérifiés un par un : ligneCommande() échappe en interne, le message d'erreur est posé
// par textContent, et CSS.escape protège un sélecteur (il n'écrit rien dans le DOM).
const SURS = [
  "${p.pieces.map((pc) => ligneCommande(pc.cle, pc.designation, pc.derniere_quantite || 0, false)).join('')}",
  '${piece.designation}',
  '${CSS.escape(cle)}',
]

// La CSP de /boutique n'autorise qu'UN script en ligne, désigné par son empreinte : modifier le script
// sans mettre à jour vercel.json casserait la page en silence (le navigateur refuse de l'exécuter).
describe('page boutique : en-têtes de sécurité', () => {
  const vercel = JSON.parse(vercelBrut) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
  const csp = vercel.headers
    .find((h) => h.source === '/boutique/:path*')
    ?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
  const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] ?? ''

  it("l'empreinte du script en ligne est celle de la CSP", async () => {
    const scripts = page.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? []
    expect(scripts.length).toBe(1)
    const code = /<script type="module">([\s\S]*?)<\/script>/.exec(page)?.[1] ?? ''
    const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
    const empreinte = btoa(String.fromCharCode(...new Uint8Array(octets)))
    expect(scriptSrc).toContain(`'sha256-${empreinte}'`)
  })

  it("aucun script ne s'exécute sans être désigné : ni 'unsafe-inline', ni 'unsafe-eval', ni joker", () => {
    expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval|\*|data:/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it('supabase-js est chargé à une version exacte', () => {
    expect(page).toMatch(/esm\.sh\/@supabase\/supabase-js@\d+\.\d+\.\d+'/)
  })
})

describe('page boutique : aucune donnée de la base entre dans le HTML sans échappement', () => {
  for (const champ of CHAMPS) {
    it(`\${…${champ}} est toujours dans echapper()`, () => {
      const interpolations = page.match(/\$\{[^}]*\}/g) ?? []
      const fautifs = interpolations.filter(
        (m) => new RegExp('\\.' + champ + '\\b|\\b' + champ + '\\b').test(m) && !m.includes('echapper(') && !SURS.includes(m),
      )
      expect(fautifs).toEqual([])
    })
  }
})
