import { describe, expect, it } from 'vitest'
import { destinatairesDeCompte, mentionDemo } from './demo.ts'

describe('destinatairesDeCompte', () => {
  it('laisse tout tel quel quand le compte n’est pas une démonstration', () => {
    const d = destinatairesDeCompte(false, 'moi@example.com', ['boutique@example.com'], ['copie@example.com'])
    expect(d).toEqual({ to: ['boutique@example.com'], cc: ['copie@example.com'], redirige: [] })
  })

  it('un compte de test (testeur) envoie normalement : seul `demo` redirige', () => {
    // La distinction du 02/10 : `est_test` ne redirige RIEN — il ne porte que l'accès gratuit.
    const d = destinatairesDeCompte(null, 'moi@example.com', ['boutique@example.com'])
    expect(d.to).toEqual(['boutique@example.com'])
  })

  it('redirige vers l’adresse du compte, et dit qui était visé', () => {
    const d = destinatairesDeCompte(true, 'Moi@Example.com', ['boutique@example.com'], ['copie@example.com'])
    expect(d.to).toEqual(['moi@example.com'])
    expect(d.cc).toEqual([])
    expect(d.redirige).toEqual(['boutique@example.com', 'copie@example.com'])
  })

  it('ne redirige pas quand le compte s’écrit déjà à lui-même', () => {
    const d = destinatairesDeCompte(true, 'moi@example.com', ['moi@example.com'])
    expect(d).toEqual({ to: ['moi@example.com'], cc: [], redirige: [] })
  })

  it('sans adresse de compte connue, ne redirige pas vers rien', () => {
    const d = destinatairesDeCompte(true, '', ['boutique@example.com'])
    expect(d).toEqual({ to: ['boutique@example.com'], cc: [], redirige: [] })
  })

  it('ignore les adresses vides plutôt que de les annoncer', () => {
    const d = destinatairesDeCompte(true, 'moi@example.com', ['', '  ', 'boutique@example.com'])
    expect(d.redirige).toEqual(['boutique@example.com'])
  })
})

describe('mentionDemo', () => {
  it('nomme les adresses écartées et dit que personne d’autre n’a rien reçu', () => {
    const m = mentionDemo(['boutique@example.com'])
    expect(m).toContain('boutique@example.com')
    expect(m).toContain('aucun mail ne part vers une boutique')
  })
})
