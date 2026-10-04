import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Login from './Login'

// La page de connexion est montée pour de vrai et on lit le HTML : ce que voit quelqu'un qui arrive sur le domaine de la boutique,
// et ce que continue de voir un artisan. Aucune base : le client d'authentification est remplacé.
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, className }: { children: unknown; to: string; className?: string }) => (
    <a href={to} className={className}>{children as never}</a>
  ),
}))
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} } }))

function rendu(hote: string, recherche = '') {
  vi.stubGlobal('window', { location: { hostname: hote, search: recherche, origin: `https://${hote}` } })
  return renderToStaticMarkup(<Login />)
}
afterEach(() => vi.unstubAllGlobals())

describe('Login', () => {
  it('sur le domaine de la boutique : « Espace boutique », le lien d’un artisan, et PAS l’inscription par code', () => {
    const html = rendu('boutique.braaise.io')
    expect(html).toContain('Espace boutique')
    expect(html).toContain('lien d&#x27;un artisan')
    expect(html).toContain('mailto:contact@braaise.io')
    expect(html).not.toContain('code d&#x27;invitation')
    expect(html).not.toContain('href="/inscription"')
  })

  it('sur l’application de l’artisan : inchangée, avec l’inscription par code', () => {
    const html = rendu('artisan.braaise.io')
    expect(html).toContain('<h1>Braaise</h1>')
    expect(html).toContain('code d&#x27;invitation')
    expect(html).not.toContain('Espace boutique')
  })

  it('le formulaire de connexion est le même des deux côtés (email, mot de passe, mot de passe oublié)', () => {
    for (const html of [rendu('boutique.braaise.io'), rendu('artisan.braaise.io')]) {
      expect(html).toContain('id="email"')
      expect(html).toContain('id="pw"')
      expect(html).toContain('Mot de passe oublié ?')
    }
  })

  it('?espace=boutique montre l’entrée boutique ailleurs (aperçu)', () => {
    expect(rendu('artisan.braaise.io', '?espace=boutique')).toContain('Espace boutique')
  })
})
