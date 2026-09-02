import { describe, expect, it } from 'vitest'
import {
  dedupeRows,
  detectDelimiter,
  findHeaderRow,
  heuristicMap,
  normalizeRow,
  parseBoolean,
  parseCsv,
  parseEnum,
  parseNumber,
  rowsFromTable,
  sanitizeLlmOutput,
  stripHtml,
  toolSchema,
  ENTITIES,
  fileKind,
} from './import-entities'

describe('parseNumber', () => {
  it.each([
    ['12,50 €', 12.5],
    ['12.50', 12.5],
    ['1.200,00', 1200],
    ['1,200.00', 1200],
    ['1 200,5', 1200.5],
    ['€ 8', 8],
    ['8€', 8],
    ['1,200', 1200],
    ['1,2', 1.2],
    ['0', 0],
    ['500g', 500],
    [42, 42],
  ])('%s → %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected)
  })
  it('rejette les valeurs illisibles', () => {
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('')).toBeNull()
    expect(parseNumber(null)).toBeNull()
    expect(parseNumber(NaN)).toBeNull()
  })
})

describe('parseBoolean', () => {
  it('reconnaît oui/non, actif/inactif, published/draft', () => {
    expect(parseBoolean('Oui')).toBe(true)
    expect(parseBoolean('non')).toBe(false)
    expect(parseBoolean('TRUE')).toBe(true)
    expect(parseBoolean('draft')).toBe(false)
    expect(parseBoolean('archivé')).toBe(false)
    expect(parseBoolean('peut-être')).toBeNull()
    expect(parseBoolean(1)).toBe(true)
  })
})

describe('parseEnum', () => {
  const unite = ENTITIES.matieres_premieres.fields.find((f) => f.key === 'unite')!
  const saison = ENTITIES.produits.fields.find((f) => f.key === 'saison')!
  const cat = ENTITIES.matieres_premieres.fields.find((f) => f.key === 'categorie')!
  it('unités', () => {
    expect(parseEnum(unite, 'grammes')).toBe('g')
    expect(parseEnum(unite, 'Kg')).toBe('kg')
    expect(parseEnum(unite, 'pcs')).toBe('piece')
    expect(parseEnum(unite, 'unités')).toBe('piece')
    expect(parseEnum(unite, 'mètres')).toBe('m')
    expect(parseEnum(unite, 'tonnes')).toBeNull()
  })
  it('saisons avec accents / partiel', () => {
    expect(parseEnum(saison, 'Noël')).toBe('noel')
    expect(parseEnum(saison, 'Collection Noël 2025')).toBe('noel')
    expect(parseEnum(saison, 'Été')).toBe('ete')
    expect(parseEnum(saison, "toute l'année")).toBe('toute_annee')
  })
  it('catégories', () => {
    expect(parseEnum(cat, 'Cire de soja')).toBe('cire')
    expect(parseEnum(cat, 'wicks')).toBe('meche')
    expect(parseEnum(cat, 'Pots en verre')).toBe('contenant')
  })
})

describe('stripHtml', () => {
  it('retire les balises et décode les entités', () => {
    expect(stripHtml('<p>Bougie <strong>figue</strong> &amp; bois</p><p>Ligne 2</p>')).toBe(
      'Bougie figue & bois\nLigne 2',
    )
  })
})

describe('normalizeRow', () => {
  it('coerce les types et ignore les vides', () => {
    const { row, issues } = normalizeRow('matieres_premieres', {
      nom: '  Cire de soja ',
      unite: 'kg',
      stock_actuel: '12,5',
      seuil_alerte: '',
      prix_unitaire: '4,20 €',
      actif: 'oui',
      categorie: 'Cire',
    })
    expect(issues).toEqual([])
    expect(row).toMatchObject({
      nom: 'Cire de soja',
      unite: 'kg',
      stock_actuel: 12.5,
      seuil_alerte: null,
      prix_unitaire: 4.2,
      actif: true,
      categorie: 'cire',
    })
  })
  it('rejette une ligne sans nom', () => {
    expect(normalizeRow('produits', { prix_vente: '10' }).row).toBeNull()
  })
  it('actif par défaut à true, nombres négatifs ignorés, texte tronqué', () => {
    const { row, issues } = normalizeRow('produits', { nom: 'x'.repeat(300), prix_vente: '-3' })
    expect(row?.actif).toBe(true)
    expect(row?.prix_vente).toBeNull()
    expect(String(row?.nom).length).toBe(200)
    expect(issues.length).toBe(2)
  })
  it('arrondit les entiers', () => {
    const { row } = normalizeRow('fournisseurs', { nom: 'A', delai_livraison_jours: '4,6' })
    expect(row?.delai_livraison_jours).toBe(5)
  })
})

describe('CSV', () => {
  it('détecte le délimiteur', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3\n')).toBe(',')
    expect(detectDelimiter('a\tb\n1\t2\n')).toBe('\t')
  })
  it('gère guillemets, retours ligne, BOM et CRLF', () => {
    const text = '﻿nom;prix\r\n"Bougie ""Figue""";"12,50"\r\n"Multi\nligne";3\r\n'
    expect(parseCsv(text)).toEqual([
      ['nom', 'prix'],
      ['Bougie "Figue"', '12,50'],
      ['Multi\nligne', '3'],
    ])
  })
  it('ignore les lignes vides', () => {
    expect(parseCsv('a,b\n\n1,2\n,\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('heuristicMap / rowsFromTable', () => {
  it('mappe un export Shopify', () => {
    const header = ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Variant Price']
    const map = heuristicMap('produits', header)
    expect(map).toMatchObject({ 0: 'shopify_handle', 1: 'nom', 2: 'description', 6: 'actif', 7: 'prix_vente' })
  })
  it('ne prend chaque champ qu’une fois, tolère accents et suffixes', () => {
    const map = heuristicMap('matieres_premieres', ['Matière', 'Qté en stock', 'Unité', 'Prix unitaire (€)', 'Fournisseur', 'Seuil mini'])
    expect(map).toEqual({ 0: 'nom', 1: 'stock_actuel', 2: 'unite', 3: 'prix_unitaire', 4: 'fournisseur_nom', 5: 'seuil_alerte' })
  })
  it('trouve l’en-tête même après des lignes de titre', () => {
    const table = [['Inventaire atelier'], [''], ['Nom', 'Stock', 'Unité'], ['Cire', '500', 'g']]
    expect(findHeaderRow('matieres_premieres', table)).toBe(2)
  })
  it('convertit un tableau complet, saute les lignes de variantes sans titre', () => {
    const table = [
      ['Handle', 'Title', 'Body (HTML)', 'Published', 'Variant Price'],
      ['figue', 'Bougie Figue', '<p>Douce</p>', 'TRUE', '14.90'],
      ['figue', '', '', '', '14.90'],
      ['bois', 'Bougie Bois brûlé', '', 'FALSE', '16'],
    ]
    const r = rowsFromTable('produits', table)
    expect(r.source).toBe('heuristique')
    expect(r.rows).toEqual([
      { nom: 'Bougie Figue', senteur: null, description: 'Douce', prix_vente: 14.9, saison: null, shopify_handle: 'figue', actif: true },
      { nom: 'Bougie Bois brûlé', senteur: null, description: null, prix_vente: 16, saison: null, shopify_handle: 'bois', actif: false },
    ])
    expect(r.warnings.some((w) => w.includes('1 ligne(s) sans nom'))).toBe(true)
  })
  it('signale l’absence d’en-tête', () => {
    const r = rowsFromTable('boutiques', [['foo', 'bar'], ['1', '2']])
    expect(r.rows).toEqual([])
    expect(r.warnings[0]).toMatch(/en-tête/)
  })
})

describe('dedupeRows / sanitizeLlmOutput', () => {
  it('dédoublonne par handle puis nom, insensible à la casse', () => {
    const rows = dedupeRows('produits', [
      { nom: 'Figue', shopify_handle: 'figue' },
      { nom: 'FIGUE', shopify_handle: null },
      { nom: 'figue ', shopify_handle: 'figue' },
      { nom: 'Bois', shopify_handle: null },
    ])
    expect(rows.map((r) => r.nom)).toEqual(['Figue', 'FIGUE', 'Bois'])
  })
  it('sanitize la sortie LLM (types, lignes invalides, avertissements)', () => {
    const r = sanitizeLlmOutput('fournisseurs', {
      lignes: [
        { nom: 'Cires Lambert', delai_livraison_jours: '5 jours', email: 'a@b.be' },
        { nom: '', email: 'x@y.z' },
        'garbage',
        { nom: 'Cires Lambert', telephone: '02 000' },
      ],
      avertissements: ['Colonne « TVA » ignorée', 42, ''],
    })
    expect(r.source).toBe('ia')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ nom: 'Cires Lambert', delai_livraison_jours: 5, email: 'a@b.be', actif: true })
    expect(r.warnings).toContain('Colonne « TVA » ignorée')
    expect(r.warnings.some((w) => w.includes('sans nom'))).toBe(true)
  })
  it('résiste à une sortie vide ou malformée', () => {
    expect(sanitizeLlmOutput('produits', null).rows).toEqual([])
    expect(sanitizeLlmOutput('produits', { lignes: 'nope' }).rows).toEqual([])
  })
})

describe('toolSchema / fileKind', () => {
  it('produit un schéma JSON valide avec les champs requis', () => {
    const s = toolSchema('matieres_premieres') as { properties: { lignes: { items: { required: string[]; properties: Record<string, { type: string; enum?: string[] }> } } } }
    expect(s.properties.lignes.items.required).toEqual(['nom'])
    expect(s.properties.lignes.items.properties.unite.enum).toContain('piece')
    expect(s.properties.lignes.items.properties.stock_actuel.type).toBe('number')
  })
  it('détecte le type de fichier', () => {
    expect(fileKind('inventaire.xlsx', '')).toBe('spreadsheet')
    expect(fileKind('x.csv', 'text/csv')).toBe('text')
    expect(fileKind('catalogue.PDF', '')).toBe('pdf')
    expect(fileKind('photo.jpg', 'image/jpeg')).toBe('image')
    expect(fileKind('x.docx', '')).toBe('unknown')
  })
})
