// Ce que la pièce jointe du mail d'accueil contient VRAIMENT.
//
// Deux choses se vérifient ici, et ce sont les deux seules qui peuvent casser en silence :
//   1. le base64 embarqué est bien **le fichier publié** (`public/modele-import-braaise.xlsx`) —
//      pas une version d'hier recopiée à la main ;
//   2. ce fichier est **reconnu par le produit** : le lecteur XLSX le relit, et le mapping
//      d'en-têtes du repli sans IA retrouve toutes les colonnes. Un modèle que le produit ne
//      comprend pas serait un mail qui envoie l'artisan dans le mur.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENTITIES, findHeaderRow, heuristicMap, rowsFromTable, type ImportEntity } from './import-entities'
import { MODELE_IMPORT_B64, MODELE_IMPORT_NOM } from './modele-import'
import { readXlsx } from './xlsx-lite'

const publie = new Uint8Array(
  readFileSync(new URL('../../../public/modele-import-braaise.xlsx', import.meta.url)),
)

const embarque = new Uint8Array(Buffer.from(MODELE_IMPORT_B64, 'base64'))

/** Le couple feuille → entité que le modèle sert. */
const SERVIS: { feuille: string; entite: ImportEntity }[] = [
  { feuille: 'Produits', entite: 'produits' },
  { feuille: 'Matieres', entite: 'matieres_premieres' },
  { feuille: 'Fournisseurs', entite: 'fournisseurs' },
  { feuille: 'Boutiques', entite: 'boutiques' },
]

describe('modèle d’import embarqué', () => {
  it('est identique au fichier publié, octet pour octet', () => {
    expect(embarque.length).toBe(publie.length)
    expect(Buffer.from(embarque).equals(Buffer.from(publie))).toBe(true)
    // et c'est bien un xlsx (signature zip), pas un fichier vide ou renommé
    expect(Array.from(publie.slice(0, 2))).toEqual([0x50, 0x4b])
    expect(MODELE_IMPORT_NOM).toBe('modele-import-braaise.xlsx')
  })

  it('porte une feuille par entité importable, plus une feuille d’aide', async () => {
    const sheets = await readXlsx(embarque)
    expect(sheets.map((s) => s.name)).toEqual([
      'Produits',
      'Matieres',
      'Fournisseurs',
      'Boutiques',
      "Mode d'emploi (ne pas importer)",
    ])
  })

  it.each(SERVIS)('la feuille $feuille est reconnue par le mapping du produit', async ({ feuille, entite }) => {
    const sheets = await readXlsx(embarque)
    const s = sheets.find((x) => x.name === feuille)!
    const hi = findHeaderRow(entite, s.rows)
    expect(hi, `aucune ligne d'en-tête reconnue dans « ${feuille} »`).toBeGreaterThanOrEqual(0)
    const map = heuristicMap(entite, s.rows[hi])
    // Aucune colonne ignorée : un en-tête que le produit ne sait pas lire est une colonne perdue.
    const ignorees = s.rows[hi].filter((h, i) => h.trim() && map[i] == null)
    expect(ignorees).toEqual([])
    // Le champ obligatoire est là, sinon chaque ligne serait écartée.
    expect(Object.values(map)).toContain('nom')
    // Et le repli sans IA ne doit inventer aucune ligne : le modèle n'a pas d'exemple.
    expect(rowsFromTable(entite, s.rows).rows).toEqual([])
    for (const f of ENTITIES[entite].fields) {
      if (f.required) expect(Object.values(map)).toContain(f.key)
    }
  })

  it('la feuille d’aide ne produit aucune ligne à importer, pour aucune entité', async () => {
    const sheets = await readXlsx(embarque)
    const aide = sheets.find((s) => s.name.startsWith("Mode d'emploi"))!
    for (const { entite } of SERVIS) {
      expect(rowsFromTable(entite, aide.rows).rows).toEqual([])
    }
  })
})
