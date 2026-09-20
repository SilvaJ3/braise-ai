import { describe, expect, it } from 'vitest'
import { renderRelevePdf } from './releve-pdf'
import type { ReleveDoc, ReleveLigne } from './releve-doc'

// Le relevé facturable se relit avec pdf.js : c'est le seul moyen de prouver qu'un vrai lecteur
// l'ouvre, et que le montant imprimé est bien celui des ventes — les reprises, elles, doivent
// apparaître sans jamais entrer dans le total.

const base: ReleveDoc = {
  numero: 'REL-2026-001',
  emis_le: '2026-09-20T08:00:00.000Z',
  periode_debut: '2026-09-18',
  periode_fin: '2026-09-18',
  emetteur: {
    nom: 'Braaise',
    adresse: 'Rue Cardinale Lavigerie 7, 1040 Etterbeek',
    telephone: '0471469685',
    tva: 'BE0797472335',
    email: 'contact@example.be',
    mention_signature: '',
  },
  boutique_nom: 'Concept Store Le Marais',
  boutique_adresse: '10 rue des Rosiers, Paris',
  boutique_email: 'contact@lemarais-store.fr',
  mode: 'depot_vente',
  lignes: [
    { cle: 'nom:bougie ambre', produit_id: null, designation: 'Bougie ambre', prix_unitaire: 28, ventes: 2, reprises: 0, montant: 56 },
    { cle: 'nom:bougie cèdre', produit_id: null, designation: 'Bougie cèdre', prix_unitaire: 32, ventes: 1, reprises: 1, montant: 32 },
  ],
  total_ventes: 88,
  nb_pieces: 3,
  nb_reprises: 1,
  valeur_reprises: 32,
  nb_declarations: 1,
  a_valider: 1,
}

async function readPdf(bytes: Uint8Array): Promise<{ pages: number; texte: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false }).promise
  let texte = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    texte += content.items.map((it: { str?: string }) => it.str ?? '').join(' ') + '\n'
  }
  return { pages: doc.numPages, texte }
}

describe('renderRelevePdf', () => {
  it('produit un PDF relisible qui porte les données du relevé', async () => {
    const { pages, texte } = await readPdf(renderRelevePdf(base))
    expect(pages).toBe(1)
    expect(texte).toContain('Braaise')
    expect(texte).toContain('BE0797472335')
    expect(texte).toContain('Relevé facturable')
    expect(texte).toContain('REL-2026-001')
    expect(texte).toContain('20/09/2026')
    expect(texte).toContain('Concept Store Le Marais')
    expect(texte).toContain('Bougie ambre')
    expect(texte).toContain('Bougie cèdre')
  })

  it('imprime le montant des ventes, et laisse les reprises en dehors', async () => {
    const { texte } = await readPdf(renderRelevePdf(base))
    expect(texte).toContain('Montant à facturer : 88 €')
    expect(texte).toContain('3 pièces vendues')
    // La reprise est montrée, chiffrée, mais annoncée hors facturation.
    expect(texte).toContain('REPRISES — NON FACTURÉES')
    expect(texte).toContain('hors facturation')
  })

  it('sort un montant qui ne compte que les ventes, même quand la reprise vaut cher', async () => {
    const avecReprises: ReleveDoc = {
      ...base,
      lignes: [
        { cle: 'a', produit_id: null, designation: 'Bougie ambre', prix_unitaire: 28, ventes: 2, reprises: 0, montant: 56 },
        { cle: 'b', produit_id: null, designation: 'Bougie cèdre', prix_unitaire: 32, ventes: 0, reprises: 3, montant: 0 },
      ],
      total_ventes: 56,
      nb_pieces: 2,
      nb_reprises: 3,
      valeur_reprises: 96,
    }
    const { texte } = await readPdf(renderRelevePdf(avecReprises))
    // pdf.js recolle les morceaux de texte avec des espaces variables : on compare sans espace.
    const colle = texte.replace(/[\s\u00a0]+/g, '')
    expect(colle).toContain('Montantàfacturer:56€')
    expect(colle).toContain('Montantàfacturer56€')
    // 96 € existe, mais uniquement comme valeur de reprise : il ne peut pas être le total.
    expect(colle).toContain('Bougiecèdre—3×32€96€')
    expect(colle).not.toContain('Montantàfacturer:96')
    expect(colle).not.toContain('Montantàfacturer96')

    expect(texte).toContain('3 pièces reprises — 96 € de valeur, hors facturation.')
  })

  it('dit « aperçu » quand le relevé n’est pas encore émis', async () => {
    const { texte } = await readPdf(renderRelevePdf({ ...base, numero: null, emis_le: null }))
    expect(texte).toContain('aperçu — pas encore émis')
    expect(texte).not.toContain('REL-2026-001')
  })

  it('répète l’en-tête du tableau quand plusieurs pages sont nécessaires', async () => {
    const lignes: ReleveLigne[] = Array.from({ length: 40 }, (_, i) => ({
      cle: `nom:piece ${i}`,
      produit_id: null,
      designation: `Pièce ${i + 1}`,
      prix_unitaire: 10,
      ventes: 1,
      reprises: 0,
      montant: 10,
    }))
    const { pages, texte } = await readPdf(
      renderRelevePdf({ ...base, lignes, total_ventes: 400, nb_pieces: 40, nb_reprises: 0, valeur_reprises: 0 }),
    )
    expect(pages).toBeGreaterThan(1)
    expect(texte.match(/ARTICLES VENDUS/g)?.length).toBe(pages)
  })

  it('rappelle le mode de vente, parce qu’il change ce que le document veut dire', async () => {
    const achat = await readPdf(renderRelevePdf({ ...base, mode: 'achat_ferme' }))
    expect(achat.texte).toContain('Mode de vente chez elle : Achat ferme')
  })
})
