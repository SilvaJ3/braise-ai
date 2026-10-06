import { readFileSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
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
    expect(r.rows[0]).toMatchObject({ nom: 'Cire de soja', categorie: 'matiere', unite: 'kg', stock_actuel: 12.5, seuil_alerte: 5, prix_unitaire: 4.2, fournisseur_nom: 'Cires Lambert', actif: true })
    expect(r.rows[1]).toMatchObject({ nom: 'Mèche coton 8 cm', categorie: 'finition', unite: 'piece', stock_actuel: 250 })
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

// --- Fichiers hostiles : un compte en essai gratuit peut envoyer n'importe quoi à `import` ---

type Fichier = { nom: string; contenu: Uint8Array; usizeDeclaree?: number }

/** Un zip minimal (méthode deflate), avec la taille décompressée DÉCLARÉE réglable : c'est le mensonge d'un fichier piégé. */
function zip(fichiers: Fichier[]): Uint8Array {
  const enc = new TextEncoder()
  const locaux: Uint8Array[] = []
  const centraux: Uint8Array[] = []
  let offset = 0
  for (const f of fichiers) {
    const nom = enc.encode(f.nom)
    const donnees = new Uint8Array(deflateRawSync(f.contenu))
    const local = new Uint8Array(30 + nom.length + donnees.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, 8, true)
    lv.setUint32(18, donnees.length, true)
    lv.setUint32(22, f.contenu.length, true)
    lv.setUint16(26, nom.length, true)
    local.set(nom, 30)
    local.set(donnees, 30 + nom.length)
    const central = new Uint8Array(46 + nom.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, 8, true)
    cv.setUint32(20, donnees.length, true)
    cv.setUint32(24, f.usizeDeclaree ?? f.contenu.length, true)
    cv.setUint16(28, nom.length, true)
    cv.setUint32(42, offset, true)
    central.set(nom, 46)
    locaux.push(local)
    centraux.push(central)
    offset += local.length
  }
  const fin = new Uint8Array(22)
  const ev = new DataView(fin.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(10, fichiers.length, true)
  ev.setUint32(12, centraux.reduce((n, c) => n + c.length, 0), true)
  ev.setUint32(16, offset, true)
  const parts = [...locaux, ...centraux, fin]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const texte = (s: string) => new TextEncoder().encode(s)
const CLASSEUR = '<workbook><sheets><sheet name="S" sheetId="1"/></sheets></workbook>'
/** Un classeur d'une feuille, dont on choisit le XML (et, au besoin, les chaînes partagées). */
const classeur = (feuille: string, extra: Fichier[] = []) =>
  zip([{ nom: 'xl/workbook.xml', contenu: texte(CLASSEUR) }, { nom: 'xl/worksheets/sheet1.xml', contenu: texte(feuille) }, ...extra])
const inline = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`

describe('xlsx-lite : fichiers piégés', () => {
  it('une cellule hors du tableau (ZZZZZZZ1) est ignorée, sans allouer des milliards de cases', async () => {
    // avant le plafond de colonnes : ~8·10⁹ cases poussées dans un tableau, jusqu'au plantage mémoire
    const feuille = `<worksheet><sheetData><row r="1">${inline('A1', 'ok')}${inline('ZZZZZZZ1', 'piège')}${inline('B1', 'suite')}</row></sheetData></worksheet>`
    const sheets = await readXlsx(classeur(feuille))
    expect(sheets[0].rows).toEqual([['ok', 'suite']])
  })

  it('la dernière colonne d’Excel (XFD) reste lisible, la suivante non', async () => {
    const feuille = `<worksheet><sheetData><row r="1">${inline('XFD1', 'dernière')}${inline('XFE1', 'hors')}</row></sheetData></worksheet>`
    const [{ rows }] = await readXlsx(classeur(feuille))
    expect(rows[0][16_383]).toBe('dernière')
    expect(rows[0]).toHaveLength(16_384)
  })

  it('zip bomb : la taille DÉCLARÉE ne protège pas, les octets réellement produits sont comptés', async () => {
    const vingtMo = new Uint8Array(20 * 1024 * 1024) // se décompresse à 20 Mo ; déclaré : 1 Ko
    const bombe = zip([
      { nom: 'xl/workbook.xml', contenu: texte(CLASSEUR) },
      { nom: 'xl/worksheets/sheet1.xml', contenu: vingtMo, usizeDeclaree: 1_000 },
    ])
    expect(bombe.length).toBeLessThan(200_000) // quelques dizaines de Ko compressés
    await expect(readXlsx(bombe)).rejects.toThrow(/trop volumineuse/)
  })

  it('un zip qui annonce des milliers d’entrées est refusé', async () => {
    const fichier = zip([{ nom: 'xl/workbook.xml', contenu: texte(CLASSEUR) }])
    new DataView(fichier.buffer).setUint16(fichier.length - 22 + 10, 60_000, true)
    await expect(readXlsx(fichier)).rejects.toThrow(/trop d’entrées/)
  })

  it('cellules jamais fermées : lecture en temps linéaire (la regex paresseuse était quadratique)', async () => {
    const feuille = `<worksheet><sheetData><row r="1">${'<c r="A1">'.repeat(200_000)}</row></sheetData></worksheet>`
    const debut = performance.now()
    const sheets = await readXlsx(classeur(feuille))
    expect(sheets).toEqual([])
    expect(performance.now() - debut).toBeLessThan(2_000)
  })

  it('chaînes partagées jamais fermées : même garantie', async () => {
    const partagees = { nom: 'xl/sharedStrings.xml', contenu: texte(`<sst>${'<si><t>x'.repeat(200_000)}</sst>`) }
    const feuille = `<worksheet><sheetData><row r="1">${inline('A1', 'ok')}</row></sheetData></worksheet>`
    const debut = performance.now()
    const [{ rows }] = await readXlsx(classeur(feuille, [partagees]))
    expect(rows).toEqual([['ok']])
    expect(performance.now() - debut).toBeLessThan(2_000)
  })

  it('plafond de cellules par feuille : la lecture s’arrête, sans exception', async () => {
    // des cellules numériques courtes : le fichier reste sous le plafond d'octets, c'est le plafond de cellules qui joue
    const ligne = (n: number) => `<row r="${n}">${Array.from({ length: 250 }, () => '<c><v>1</v></c>').join('')}</row>`
    const feuille = `<worksheet><sheetData>${Array.from({ length: 2_100 }, (_, i) => ligne(i + 1)).join('')}</sheetData></worksheet>`
    const [{ rows }] = await readXlsx(classeur(feuille), { maxRows: 5_000 })
    expect(rows.length).toBeLessThanOrEqual(2_000) // 500 000 cellules / 250 par ligne
  })
})
