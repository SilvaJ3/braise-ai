import { describe, expect, it } from 'vitest'
import { variablesBuildManquantes } from './vite.config'

// Garde-fou du build : sans VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, Rollup retire
// l'application entière du bundle (cf. commentaire de vite.config.ts). Ces tests figent le
// diagnostic pour qu'il ne reparte pas en silence.
describe('variablesBuildManquantes', () => {
  it('ne signale rien quand les deux variables sont renseignées', () => {
    expect(
      variablesBuildManquantes({
        VITE_SUPABASE_URL: 'https://exemple.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'cle',
      }),
    ).toEqual([])
  })

  it("signale l'URL absente", () => {
    expect(variablesBuildManquantes({ VITE_SUPABASE_ANON_KEY: 'cle' })).toEqual([
      'VITE_SUPABASE_URL',
    ])
  })

  it('signale la clé absente', () => {
    expect(
      variablesBuildManquantes({ VITE_SUPABASE_URL: 'https://exemple.supabase.co' }),
    ).toEqual(['VITE_SUPABASE_ANON_KEY'])
  })

  it('traite la chaîne vide comme absente', () => {
    expect(
      variablesBuildManquantes({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }),
    ).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'])
  })

  it('signale les deux quand rien n’est défini', () => {
    expect(variablesBuildManquantes({})).toEqual([
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
    ])
  })
})
