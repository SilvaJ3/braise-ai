import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { BesoinMatiere } from '../lib/atelier'
import ACommander from './ACommander'

// Le bloc est monté pour de vrai et on lit le HTML rendu : ce qui compte ici est ce que l'artisan
// voit à l'accueil — le nom de la matière, la quantité à racheter, et l'absence totale du bloc
// quand il n'y a rien à commander.
//
// Les données de l'atelier sont remplacées (lib/atelier importe le client Supabase, qui exige des
// variables d'environnement) : ce banc d'essai ne demande ni base, ni configuration.

const { signal, besoins } = vi.hoisted(() => ({
  signal: { valeur: false },
  besoins: { valeur: [] as BesoinMatiere[] },
}))

vi.mock('../lib/atelier', () => ({
  useBesoinMatiereSignale: () => signal.valeur,
  useBesoinsMatiere: () => ({ data: besoins.valeur, isLoading: false }),
  fmtQty: (n: number, unite: string) => `${n} ${unite}`,
}))

function rendre() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ACommander />
    </MemoryRouter>,
  )
}

function matiere(nom: string, unite: string, stock: number) {
  return { id: `m-${nom}`, nom, unite, stock_actuel: stock } as unknown as BesoinMatiere['matiere']
}

describe('ACommander', () => {
  it("n'affiche rien quand il n'y a rien à commander", () => {
    signal.valeur = false
    besoins.valeur = []
    expect(rendre()).toBe('')
  })

  it("n'affiche rien quand le signal serveur est vrai mais le détail vide", () => {
    signal.valeur = true
    besoins.valeur = []
    expect(rendre()).toBe('')
  })

  it('affiche le titre, la quantité à racheter et le fournisseur', () => {
    signal.valeur = true
    besoins.valeur = [
      {
        matiere: matiere('Mèches en coton', 'piece', 18),
        besoin: 40,
        disponible: 18,
        aCommander: 22,
        fournisseur: { id: 'f-1', nom: 'Mercerie du Nord' } as unknown as BesoinMatiere['fournisseur'],
        nbCommandes: 2,
      },
    ]
    const html = rendre()
    expect(html).toContain('À commander')
    expect(html).toContain('Mèches en coton')
    expect(html).toContain('Mercerie du Nord')
    expect(html).toContain('18 piece en stock')
    expect(html).toContain('à commander 22 piece')
    expect(html).toContain('/atelier?tab=besoins')
  })

  it('sans fournisseur renseigné, la ligne reste lisible', () => {
    signal.valeur = true
    besoins.valeur = [
      {
        matiere: matiere('Cire de soja', 'kg', 1),
        besoin: 6,
        disponible: 1,
        aCommander: 5,
        fournisseur: null,
        nbCommandes: 1,
      },
    ]
    const html = rendre()
    expect(html).toContain('Cire de soja')
    expect(html).toContain('à commander 5 kg')
  })
})
