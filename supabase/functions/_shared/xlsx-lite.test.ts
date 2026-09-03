import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rowsFromTable } from './import-entities'
import { colIndex, readXlsx, serialToIso, sheetToCsv } from './xlsx-lite'

const fixture = () => new Uint8Array(readFileSync(new URL('./__fixtures__/inventaire.xlsx', import.meta.url)))

describe('xlsx-lite', () => {
  it('colIndex / serialToIso', () => {
    expect(colIndex('A1')).toBe(0)
    expect(colIndex('Z9')).toBe(25)
    expect(colIndex('AA12')).toBe(26)
    expect(serialToIso(45881)).toBe('2025-08-12')
    expect(serialToIso(1)).toBe('1900-01-01')
    expect(serialToIso(45881.5)).toBe('2025-08-12 12:00')
  })

  it('lit un classeur openpyxl : feuilles, chaînes partagées, dates, booléens, lignes vides', async () => {
    const sheets = await readXlsx(fixture())
    expect(sheets.map((s) => s.name)).toEqual(['Inventaire', 'Notes'])
    const rows = sheets[0].rows
    expect(rows[0]).toEqual(['Inventaire atelier — Au Coin du Feu'])
    expect(rows[1][0]).toBe('Matière')
    expect(rows[2]).toEqual(['Cire de soja', 'Cire', '12.5', 'kg', '5', '4.2', 'Cires Lambert', '2026-08-12', 'TRUE'])
    expect(rows[4][0]).toBe('Parfum "Figue & bois"')
    expect(rows[5][8]).toBe('FALSE')
    // formule sans valeur cachée → cellule vide, ligne conservée si autre contenu
    expect(rows.length).toBe(6)
  })

  it('s’enchaîne avec le mapping heuristique', async () => {
    const [inv] = await readXlsx(fixture())
    const r = rowsFromTable('matieres_premieres', inv.rows)
    expect(r.rows).toHaveLength(4)
    expect(r.rows[0]).toMatchObject({ nom: 'Cire de soja', categorie: 'cire', unite: 'kg', stock_actuel: 12.5, seuil_alerte: 5, prix_unitaire: 4.2, fournisseur_nom: 'Cires Lambert', actif: true })
    expect(r.rows[1]).toMatchObject({ nom: 'Mèche coton 8 cm', categorie: 'meche', unite: 'piece', stock_actuel: 250 })
    expect(r.rows[3]).toMatchObject({ nom: 'Pot verre 180 ml', unite: 'piece', actif: false })
    expect(r.warnings.some((w) => w.includes('Dernier achat'))).toBe(true)
  })

  it('rejette un fichier qui n’est pas un zip', async () => {
    await expect(readXlsx(new TextEncoder().encode('nom;prix\nx;1'))).rejects.toThrow(/EOCD/)
  })

  it('sheetToCsv échappe correctement', () => {
    expect(sheetToCsv([['a', 'b;c'], ['"q"', 'x\ny']])).toBe('a;"b;c"\n"""q""";"x\ny"')
  })
})
