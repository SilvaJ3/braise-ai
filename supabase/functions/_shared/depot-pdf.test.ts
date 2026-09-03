import { describe, expect, it } from 'vitest'
import type { DepotDoc } from './depot-doc'
import { renderDepotPdf } from './depot-pdf'
import { JPEG_1PX } from './pdf-lite.test'

const emetteur = {
  nom: 'Au Coin du Feu',
  adresse: 'Rue Cardinale Lavigerie 7, 1040 Etterbeek',
  telephone: '0471469685',
  tva: 'BE0797472335',
  email: 'contact@example.be',
  mention_signature: 'EN SIGNANT, J’ACCEPTE LES CONDITIONS GÉNÉRALES INDIQUÉES DANS LE CONTRAT INITIAL :',
}

const base: DepotDoc = {
  numero: '2026-001',
  date_depot: '2026-09-03',
  emetteur,
  boutique_nom: 'La Petite Boutique',
  boutique_adresse: 'Rue Dansaert 12, 1000 Bruxelles',
  boutique_email: 'contact@laboutique.be',
  lignes: [
    { designation: 'Coffret brûleur', quantite: 2, prix_unitaire: 40 },
    { designation: 'Grande bougie', quantite: 3, prix_unitaire: 35 },
    { designation: 'Suspension parfumée', quantite: 10, prix_unitaire: 6 },
  ],
  notes: null,
  signataire_nom: 'Marie Dupont',
  signature_image: JPEG_1PX,
}

/** Relit le PDF avec pdf.js : c'est le seul moyen de prouver qu'un vrai lecteur l'ouvre. */
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

describe('renderDepotPdf', () => {
  it('produit un PDF relisible contenant les données du bon', async () => {
    const { pages, texte } = await readPdf(renderDepotPdf(base))
    expect(pages).toBe(1)
    expect(texte).toContain('Au Coin du Feu')
    expect(texte).toContain('BE0797472335')
    expect(texte).toContain('Bon de dépôt')
    expect(texte).toContain('La Petite Boutique')
    expect(texte).toContain('Rue Dansaert 12, 1000 Bruxelles')
    expect(texte).toContain('2026-001')
    expect(texte).toContain('03/09/2026')
    expect(texte).toContain('Coffret brûleur')
    expect(texte).toContain('Marie Dupont')
  })

  it('affiche les totaux justes', async () => {
    const { texte } = await readPdf(renderDepotPdf(base))
    expect(texte).toContain('80 €') // 2 × 40
    expect(texte).toContain('105 €') // 3 × 35
    expect(texte).toContain('60 €') // 10 × 6
    expect(texte).toContain('245 €') // total
  })

  it('conserve les accents et l’apostrophe typographique', async () => {
    const { texte } = await readPdf(renderDepotPdf(base))
    expect(texte).toContain('Suspension parfumée')
    expect(texte).toContain('J’ACCEPTE')
    expect(texte).toContain('DÉTAIL DU DÉPÔT')
  })

  it('passe à la page suivante quand les articles débordent, avec pagination', async () => {
    const lignes = Array.from({ length: 60 }, (_, i) => ({
      designation: `Article ${i + 1}`,
      quantite: 1,
      prix_unitaire: 10,
    }))
    const { pages, texte } = await readPdf(renderDepotPdf({ ...base, lignes }))
    expect(pages).toBeGreaterThan(1)
    expect(texte).toContain('Article 60')
    expect(texte).toContain(`1/${pages}`)
    expect(texte).toContain('600 €')
  })

  it('reste lisible sans signature ni numéro', async () => {
    const { texte } = await readPdf(
      renderDepotPdf({ ...base, numero: null, signature_image: null, signataire_nom: null }),
    )
    expect(texte).toContain('SIGNATURE :')
    expect(texte).not.toContain('2026-001')
  })

  it('n’échoue pas sur une signature illisible', async () => {
    const { texte } = await readPdf(renderDepotPdf({ ...base, signature_image: 'pas-du-jpeg' }))
    expect(texte).toContain('SIGNATURE :')
  })

  it('imprime la note quand elle existe', async () => {
    const { texte } = await readPdf(renderDepotPdf({ ...base, notes: 'Reprise des invendus fin octobre.' }))
    expect(texte).toContain('Reprise des invendus fin octobre.')
  })
})
