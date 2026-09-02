// Module partagé client (Vite) / edge function (Deno) : définition des entités importables,
// normalisation des lignes, parseur CSV et mapping heuristique de secours.
// Aucune dépendance, aucun accès DOM/Deno : doit rester du TypeScript pur.

export type ImportEntity = 'produits' | 'matieres_premieres' | 'fournisseurs' | 'boutiques'

export type FieldType = 'text' | 'number' | 'integer' | 'boolean' | 'enum'

export type FieldDef = {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** valeurs autorisées (type enum) */
  values?: readonly string[]
  /** longueur max (text) */
  max?: number
  /** minimum (number/integer) */
  min?: number
  /** indications pour le LLM */
  description: string
  /** en-têtes de colonnes reconnus (heuristique de secours, insensible casse/accents) */
  synonyms: readonly string[]
}

export type EntityDef = {
  label: string
  labelSingular: string
  /** table cible ; les champs virtuels (ex. fournisseur_nom) sont résolus côté client */
  table: string
  fields: FieldDef[]
  /** clés servant à reconnaître une ligne déjà en base, par ordre de priorité */
  dedupeKeys: string[]
  hint: string
}

const bool: Pick<FieldDef, 'type' | 'description' | 'synonyms'> = {
  type: 'boolean',
  description: 'true sauf si la ligne indique clairement inactif/archivé/non publié',
  synonyms: ['actif', 'active', 'published', 'publie', 'statut', 'status', 'enabled'],
}

export const ENTITIES: Record<ImportEntity, EntityDef> = {
  produits: {
    label: 'Bougies (catalogue)',
    labelSingular: 'bougie',
    table: 'produits',
    dedupeKeys: ['shopify_handle', 'nom'],
    hint: "Export Shopify (Title, Body (HTML), Variant Price, Handle) ou tableau maison. Une ligne par produit ; les lignes de variantes/images sans titre sont ignorées.",
    fields: [
      { key: 'nom', label: 'Nom', type: 'text', required: true, max: 200, description: 'nom commercial du produit', synonyms: ['nom', 'name', 'title', 'titre', 'produit', 'product', 'bougie', 'designation', 'désignation', 'libelle', 'libellé', 'article'] },
      { key: 'senteur', label: 'Senteur', type: 'text', max: 200, description: 'parfum / notes olfactives', synonyms: ['senteur', 'parfum', 'fragrance', 'scent', 'odeur', 'notes'] },
      { key: 'description', label: 'Histoire / angle', type: 'text', max: 2000, description: 'description courte, texte brut sans HTML', synonyms: ['description', 'body', 'body (html)', 'histoire', 'texte', 'details', 'détails'] },
      { key: 'prix_vente', label: 'Prix (€)', type: 'number', min: 0, description: 'prix de vente TTC en euros, nombre décimal', synonyms: ['prix', 'prix de vente', 'prix_vente', 'price', 'variant price', 'pv', 'tarif', 'prix ttc'] },
      { key: 'saison', label: 'Saison', type: 'enum', values: ['toute_annee', 'printemps', 'ete', 'automne', 'hiver', 'noel'], description: 'saison de vente si évidente (ex. "Noël", "hiver"), sinon vide', synonyms: ['saison', 'season', 'collection'] },
      { key: 'shopify_handle', label: 'Handle Shopify', type: 'text', max: 200, description: 'identifiant Shopify (colonne Handle) si présent', synonyms: ['handle', 'shopify_handle', 'slug', 'sku', 'reference', 'référence', 'ref'] },
      { key: 'actif', label: 'Actif', ...bool },
    ],
  },
  matieres_premieres: {
    label: 'Matières premières',
    labelSingular: 'matière',
    table: 'matieres_premieres',
    dedupeKeys: ['nom'],
    hint: 'Inventaire : cire, mèches, parfums, contenants… avec stock, unité, seuil et fournisseur.',
    fields: [
      { key: 'nom', label: 'Nom', type: 'text', required: true, max: 200, description: 'nom de la matière (ex. "Cire de soja", "Mèche coton 8 cm")', synonyms: ['nom', 'name', 'matiere', 'matière', 'matiere premiere', 'designation', 'désignation', 'libelle', 'libellé', 'article', 'produit', 'item', 'composant', 'ingredient', 'ingrédient'] },
      { key: 'categorie', label: 'Catégorie', type: 'enum', values: ['cire', 'meche', 'parfum', 'contenant', 'colorant', 'emballage', 'autre'], description: 'déduis-la du nom si absente (cire, meche, parfum, contenant, colorant, emballage, autre)', synonyms: ['categorie', 'catégorie', 'category', 'type', 'famille', 'groupe'] },
      { key: 'unite', label: 'Unité', type: 'enum', values: ['g', 'kg', 'ml', 'l', 'piece', 'm'], description: "unité de stock : g, kg, ml, l, piece (unités/pièces), m (mètres). Si le stock est donné en 'pcs', 'unités', 'pièces' → piece", synonyms: ['unite', 'unité', 'unit', 'uom', 'u'] },
      { key: 'stock_actuel', label: 'Stock', type: 'number', min: 0, description: "quantité en stock, nombre (0 si inconnu)", synonyms: ['stock', 'stock actuel', 'stock_actuel', 'quantite', 'quantité', 'qty', 'quantity', 'qte', 'qté', 'inventaire', 'inventory', 'en stock', 'dispo', 'disponible'] },
      { key: 'seuil_alerte', label: "Seuil d'alerte", type: 'number', min: 0, description: 'niveau de stock en dessous duquel il faut recommander, si indiqué', synonyms: ['seuil', "seuil d'alerte", 'seuil_alerte', 'alerte', 'minimum', 'min', 'stock min', 'stock minimum', 'reorder', 'reorder point', 'seuil mini'] },
      { key: 'prix_unitaire', label: 'Prix unitaire (€)', type: 'number', min: 0, description: "prix d'achat par unité de stock en euros (si le fichier donne un prix par kg et l'unité est g, convertis)", synonyms: ['prix', 'prix unitaire', 'prix_unitaire', 'pu', 'cout', 'coût', 'cost', 'unit cost', 'unit price', "prix d'achat", 'pa', 'tarif'] },
      { key: 'fournisseur_nom', label: 'Fournisseur', type: 'text', max: 200, description: 'nom du fournisseur tel quel', synonyms: ['fournisseur', 'supplier', 'vendor', 'fourn', 'fourn.', 'achete chez', 'acheté chez', 'marque', 'brand'] },
      { key: 'reference_fournisseur', label: 'Réf. fournisseur', type: 'text', max: 100, description: 'référence / code article chez le fournisseur', synonyms: ['reference', 'référence', 'ref', 'ref fournisseur', 'reference fournisseur', 'code', 'sku', 'code article'] },
      { key: 'notes', label: 'Notes', type: 'text', max: 4000, description: 'remarques utiles', synonyms: ['notes', 'note', 'remarque', 'remarques', 'commentaire', 'commentaires', 'comment', 'comments', 'observations'] },
      { key: 'actif', label: 'Actif', ...bool },
    ],
  },
  fournisseurs: {
    label: 'Fournisseurs',
    labelSingular: 'fournisseur',
    table: 'fournisseurs',
    dedupeKeys: ['nom'],
    hint: 'Carnet fournisseurs : nom, contact, délai de livraison.',
    fields: [
      { key: 'nom', label: 'Nom', type: 'text', required: true, max: 200, description: "nom de l'entreprise ou du fournisseur", synonyms: ['nom', 'name', 'fournisseur', 'supplier', 'vendor', 'societe', 'société', 'entreprise', 'company', 'raison sociale'] },
      { key: 'email', label: 'Email', type: 'text', max: 200, description: 'adresse email', synonyms: ['email', 'e-mail', 'mail', 'courriel', 'contact email'] },
      { key: 'telephone', label: 'Téléphone', type: 'text', max: 50, description: 'numéro de téléphone tel quel', synonyms: ['telephone', 'téléphone', 'tel', 'tél', 'tel.', 'phone', 'gsm', 'mobile', 'portable'] },
      { key: 'site_web', label: 'Site web', type: 'text', max: 300, description: 'URL du site', synonyms: ['site', 'site web', 'site_web', 'website', 'web', 'url', 'lien'] },
      { key: 'delai_livraison_jours', label: 'Délai (jours)', type: 'integer', min: 0, description: 'délai de livraison habituel en jours (entier)', synonyms: ['delai', 'délai', 'delai livraison', 'délai de livraison', 'delai_livraison_jours', 'lead time', 'livraison', 'jours'] },
      { key: 'notes', label: 'Notes', type: 'text', max: 4000, description: 'remarques utiles (conditions, minimum de commande…)', synonyms: ['notes', 'note', 'remarque', 'remarques', 'commentaire', 'commentaires', 'comment', 'comments', 'observations', 'conditions'] },
      { key: 'actif', label: 'Actif', ...bool },
    ],
  },
  boutiques: {
    label: 'Boutiques (dépôt-vente)',
    labelSingular: 'boutique',
    table: 'boutiques',
    dedupeKeys: ['nom'],
    hint: 'Liste de boutiques / points de vente : nom, adresse, contact.',
    fields: [
      { key: 'nom', label: 'Nom', type: 'text', required: true, max: 200, description: 'nom de la boutique', synonyms: ['nom', 'name', 'boutique', 'magasin', 'shop', 'store', 'point de vente', 'enseigne', 'client'] },
      { key: 'adresse', label: 'Adresse', type: 'text', max: 400, description: 'adresse postale complète sur une ligne (rue, code postal, ville)', synonyms: ['adresse', 'address', 'rue', 'localisation', 'lieu', 'ville', 'city'] },
      { key: 'horaires', label: 'Horaires', type: 'text', max: 300, description: "horaires d'ouverture en texte libre", synonyms: ['horaires', 'horaire', 'hours', 'opening hours', 'ouverture', 'heures'] },
      { key: 'canal_prefere', label: 'Canal préféré', type: 'enum', values: ['email', 'telephone', 'instagram', 'visite', 'autre'], description: 'canal de contact préféré si indiqué', synonyms: ['canal', 'canal prefere', 'canal préféré', 'canal_prefere', 'contact via', 'moyen de contact'] },
      { key: 'email', label: 'Email', type: 'text', max: 200, description: 'adresse email', synonyms: ['email', 'e-mail', 'mail', 'courriel'] },
      { key: 'telephone', label: 'Téléphone', type: 'text', max: 50, description: 'numéro de téléphone tel quel', synonyms: ['telephone', 'téléphone', 'tel', 'tél', 'tel.', 'phone', 'gsm', 'mobile'] },
      { key: 'notes', label: 'Notes', type: 'text', max: 4000, description: 'remarques utiles (contact, conditions, historique)', synonyms: ['notes', 'note', 'remarque', 'remarques', 'commentaire', 'commentaires', 'comment', 'contact', 'responsable', 'gerant', 'gérant'] },
      { key: 'actif', label: 'Actif', ...bool },
    ],
  },
}

export const IMPORT_ENTITIES = Object.keys(ENTITIES) as ImportEntity[]

export function isImportEntity(v: unknown): v is ImportEntity {
  return typeof v === 'string' && v in ENTITIES
}

export type ImportRow = Record<string, string | number | boolean | null>

export type ImportResult = {
  rows: ImportRow[]
  warnings: string[]
  /** 'ia' = parsé par Claude, 'heuristique' = mapping par en-têtes */
  source: 'ia' | 'heuristique'
}

// --- Schéma d'outil (tool use) construit depuis la définition ---------------------------

export function toolSchema(entity: ImportEntity) {
  const def = ENTITIES[entity]
  const properties: Record<string, unknown> = {}
  for (const f of def.fields) {
    const base: Record<string, unknown> = { description: f.description }
    if (f.type === 'text') Object.assign(base, { type: 'string' })
    else if (f.type === 'number') Object.assign(base, { type: 'number' })
    else if (f.type === 'integer') Object.assign(base, { type: 'integer' })
    else if (f.type === 'boolean') Object.assign(base, { type: 'boolean' })
    else Object.assign(base, { type: 'string', enum: [...(f.values ?? [])] })
    properties[f.key] = base
  }
  return {
    type: 'object',
    properties: {
      lignes: {
        type: 'array',
        description: `Une entrée par ${def.labelSingular} trouvée dans le document.`,
        items: {
          type: 'object',
          properties,
          required: def.fields.filter((f) => f.required).map((f) => f.key),
        },
      },
      avertissements: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Ce que tu n'as pas pu interpréter, colonnes ignorées, ambiguïtés, lignes écartées. Français, une phrase par point. Vide si tout est clair.",
      },
    },
    required: ['lignes', 'avertissements'],
  }
}

// --- Normalisation / coercition ---------------------------------------------------------

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export const normKey = (s: string) =>
  stripAccents(String(s ?? ''))
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** "12,50 €", "1.200,00", "1 200.5", "€ 8" → nombre ; sinon null */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/[€$£\s ']/g, '').replace(/[a-zA-Z%]+$/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // le dernier séparateur est le décimal, l'autre est un séparateur de milliers
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    // "1,200" (milliers) vs "1,2" (décimal) : 3 chiffres après la virgule unique = milliers
    const parts = s.split(',')
    s = parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 ? parts.join('') : s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const FALSY = new Set(['0', 'false', 'non', 'no', 'n', 'inactif', 'inactive', 'archived', 'archive', 'archivé', 'draft', 'brouillon', 'off', 'unpublished', 'desactive', 'désactivé'])
const TRUTHY = new Set(['1', 'true', 'oui', 'yes', 'y', 'actif', 'active', 'on', 'published', 'publie', 'publié', 'ok', 'x'])

export function parseBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v !== 'string') return null
  const s = normKey(v)
  if (!s) return null
  if (FALSY.has(s)) return false
  if (TRUTHY.has(s)) return true
  return null
}

const ENUM_ALIASES: Record<string, Record<string, string>> = {
  saison: { 'toute l annee': 'toute_annee', 'toute annee': 'toute_annee', 'all year': 'toute_annee', annee: 'toute_annee', 'printemps': 'printemps', spring: 'printemps', 'ete': 'ete', summer: 'ete', automne: 'automne', fall: 'automne', autumn: 'automne', hiver: 'hiver', winter: 'hiver', noel: 'noel', christmas: 'noel', xmas: 'noel', fetes: 'noel' },
  unite: { g: 'g', gr: 'g', gramme: 'g', grammes: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramme: 'kg', ml: 'ml', millilitre: 'ml', millilitres: 'ml', cl: 'ml', l: 'l', litre: 'l', litres: 'l', liter: 'l', piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', pce: 'piece', unite: 'piece', unites: 'piece', u: 'piece', unit: 'piece', units: 'piece', each: 'piece', ea: 'piece', m: 'm', metre: 'm', metres: 'm', meter: 'm', meters: 'm' },
  categorie: { cire: 'cire', wax: 'cire', cires: 'cire', meche: 'meche', meches: 'meche', wick: 'meche', wicks: 'meche', parfum: 'parfum', parfums: 'parfum', fragrance: 'parfum', 'huile parfumee': 'parfum', 'huile': 'parfum', contenant: 'contenant', contenants: 'contenant', pot: 'contenant', pots: 'contenant', verre: 'contenant', verres: 'contenant', jar: 'contenant', jars: 'contenant', bocal: 'contenant', colorant: 'colorant', colorants: 'colorant', dye: 'colorant', pigment: 'colorant', emballage: 'emballage', emballages: 'emballage', packaging: 'emballage', boite: 'emballage', boites: 'emballage', etiquette: 'emballage', etiquettes: 'emballage', autre: 'autre', other: 'autre', divers: 'autre' },
  canal_prefere: { email: 'email', mail: 'email', 'e mail': 'email', courriel: 'email', telephone: 'telephone', tel: 'telephone', phone: 'telephone', gsm: 'telephone', sms: 'telephone', whatsapp: 'telephone', instagram: 'instagram', insta: 'instagram', ig: 'instagram', dm: 'instagram', visite: 'visite', 'sur place': 'visite', physique: 'visite', passage: 'visite', autre: 'autre', other: 'autre' },
}

export function parseEnum(field: FieldDef, v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = normKey(v)
  if (!s) return null
  const values = field.values ?? []
  if (values.includes(s)) return s
  const aliases = ENUM_ALIASES[field.key] ?? {}
  if (aliases[s]) return aliases[s]
  // correspondance partielle ("Noël 2025" → noel, "cire de soja" → cire)
  for (const [alias, target] of Object.entries(aliases)) {
    if (alias.length >= 3 && s.includes(alias)) return target
  }
  return null
}

export type Normalized = { row: ImportRow | null; issues: string[] }

/** Coerce une ligne brute (LLM ou mapping heuristique) vers les types attendus. */
export function normalizeRow(entity: ImportEntity, raw: Record<string, unknown>): Normalized {
  const def = ENTITIES[entity]
  const row: ImportRow = {}
  const issues: string[] = []
  for (const f of def.fields) {
    const v = raw[f.key]
    let out: string | number | boolean | null = null
    if (v != null && v !== '') {
      if (f.type === 'text') {
        let s = typeof v === 'string' ? v : String(v)
        s = stripHtml(s).replace(/\s+/g, ' ').trim()
        if (f.max && s.length > f.max) {
          s = s.slice(0, f.max)
          issues.push(`${f.label} tronqué à ${f.max} caractères`)
        }
        out = s || null
      } else if (f.type === 'number' || f.type === 'integer') {
        const n = parseNumber(v)
        if (n == null) issues.push(`${f.label} illisible : « ${String(v).slice(0, 30)} »`)
        else if (f.min != null && n < f.min) issues.push(`${f.label} négatif ignoré`)
        else out = f.type === 'integer' ? Math.round(n) : Math.round(n * 10000) / 10000
      } else if (f.type === 'boolean') {
        out = parseBoolean(v)
      } else {
        out = parseEnum(f, v)
        if (out == null) issues.push(`${f.label} inconnu : « ${String(v).slice(0, 30)} »`)
      }
    }
    if (f.type === 'boolean' && out == null) out = true
    if (f.required && (out == null || out === '')) {
      return { row: null, issues: [`${f.label} manquant`] }
    }
    row[f.key] = out
  }
  return { row, issues }
}

// --- CSV --------------------------------------------------------------------------------

export function detectDelimiter(text: string): string {
  const head = text.slice(0, 8000)
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestScore = -1
  for (const d of candidates) {
    // On parse réellement (guillemets, retours ligne dans les champs) et on note la
    // régularité du nombre de colonnes : le bon délimiteur donne des lignes homogènes.
    const rows = parseCsv(head, d).slice(0, 12)
    if (!rows.length) continue
    const width = rows[0].length
    if (width < 2) continue
    const same = rows.filter((r) => r.length === width).length
    const score = same * 10 - (rows.length - same) * 5 + width
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/** Parseur CSV tolérant : guillemets, retours ligne dans les champs, BOM, délimiteur auto. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const d = delimiter ?? detectDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') {
      quoted = true
    } else if (c === d) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

// --- Mapping heuristique (secours sans IA) ----------------------------------------------

/** Indice de la ligne d'en-tête : première ligne dont ≥2 cellules ressemblent à un champ connu. */
export function findHeaderRow(entity: ImportEntity, table: string[][]): number {
  const def = ENTITIES[entity]
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const hits = table[i].filter((h) => def.fields.some((f) => matchesField(f, h))).length
    if (hits >= 2 || (hits === 1 && table[i].length === 1)) return i
  }
  return -1
}

function matchesField(f: FieldDef, header: string): boolean {
  const h = normKey(header)
  if (!h) return false
  if (h === normKey(f.key) || h === normKey(f.label)) return true
  return f.synonyms.some((s) => normKey(s) === h)
}

/** colonne → clé de champ. Chaque champ n'est pris qu'une fois (première colonne qui matche). */
export function heuristicMap(entity: ImportEntity, header: string[]): Record<number, string> {
  const def = ENTITIES[entity]
  const map: Record<number, string> = {}
  const used = new Set<string>()
  // passe 1 : correspondances exactes
  header.forEach((h, i) => {
    const f = def.fields.find((f) => !used.has(f.key) && matchesField(f, h))
    if (f) {
      map[i] = f.key
      used.add(f.key)
    }
  })
  // passe 2 : l'en-tête contient un synonyme ("Prix TTC (€)" → prix)
  header.forEach((h, i) => {
    if (map[i] != null) return
    const nh = normKey(h)
    if (!nh) return
    const f = def.fields.find(
      (f) => !used.has(f.key) && f.synonyms.some((s) => normKey(s).length >= 3 && nh.includes(normKey(s))),
    )
    if (f) {
      map[i] = f.key
      used.add(f.key)
    }
  })
  return map
}

export function rowsFromTable(entity: ImportEntity, table: string[][]): ImportResult {
  const warnings: string[] = []
  const hi = findHeaderRow(entity, table)
  if (hi === -1) {
    return { rows: [], warnings: ["Aucune ligne d'en-tête reconnue (nom, prix, stock…)."], source: 'heuristique' }
  }
  const header = table[hi]
  const map = heuristicMap(entity, header)
  const mapped = new Set(Object.values(map))
  if (!mapped.has('nom')) {
    return { rows: [], warnings: ['Colonne « nom » introuvable.'], source: 'heuristique' }
  }
  const ignored = header.filter((h, i) => h.trim() && map[i] == null)
  if (ignored.length) warnings.push(`Colonnes ignorées : ${ignored.slice(0, 8).join(', ')}${ignored.length > 8 ? '…' : ''}`)

  const rows: ImportRow[] = []
  let dropped = 0
  for (let r = hi + 1; r < table.length; r++) {
    const raw: Record<string, unknown> = {}
    for (const [i, key] of Object.entries(map)) raw[key] = table[r][Number(i)] ?? ''
    const { row, issues } = normalizeRow(entity, raw)
    if (!row) {
      dropped++
      continue
    }
    rows.push(row)
    for (const msg of issues) if (warnings.length < 30) warnings.push(`Ligne ${r + 1} : ${msg}`)
  }
  if (dropped) warnings.push(`${dropped} ligne(s) sans nom ignorée(s).`)
  return { rows: dedupeRows(entity, rows), warnings, source: 'heuristique' }
}

/** Clé de dédoublonnage d'une ligne (première clé disponible), insensible à la casse. */
export function dedupeKeyOf(entity: ImportEntity, row: ImportRow): string | null {
  for (const k of ENTITIES[entity].dedupeKeys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim()) return `${k}:${normKey(v)}`
  }
  return null
}

/** Supprime les doublons internes au fichier (garde la première occurrence). */
export function dedupeRows(entity: ImportEntity, rows: ImportRow[]): ImportRow[] {
  const seen = new Set<string>()
  const out: ImportRow[] = []
  for (const r of rows) {
    const k = dedupeKeyOf(entity, r)
    if (k && seen.has(k)) continue
    if (k) seen.add(k)
    out.push(r)
  }
  return out
}

/** Sanitize la sortie du LLM : chaque ligne repasse par normalizeRow. */
export function sanitizeLlmOutput(entity: ImportEntity, input: unknown): ImportResult {
  const obj = (input ?? {}) as { lignes?: unknown; avertissements?: unknown }
  const lignes = Array.isArray(obj.lignes) ? obj.lignes : []
  const warnings = (Array.isArray(obj.avertissements) ? obj.avertissements : [])
    .filter((w): w is string => typeof w === 'string' && w.trim() !== '')
    .map((w) => w.trim().slice(0, 300))
    .slice(0, 30)
  const rows: ImportRow[] = []
  let dropped = 0
  for (const l of lignes.slice(0, MAX_ROWS)) {
    if (!l || typeof l !== 'object') continue
    const { row, issues } = normalizeRow(entity, l as Record<string, unknown>)
    if (!row) {
      dropped++
      continue
    }
    rows.push(row)
    for (const msg of issues) if (warnings.length < 40) warnings.push(`${String(row.nom)} : ${msg}`)
  }
  if (dropped) warnings.push(`${dropped} ligne(s) sans nom ignorée(s).`)
  if (lignes.length > MAX_ROWS) warnings.push(`Fichier tronqué à ${MAX_ROWS} lignes.`)
  return { rows: dedupeRows(entity, rows), warnings, source: 'ia' }
}

export const MAX_ROWS = 500
export const MAX_FILE_BYTES = 6 * 1024 * 1024
export const MAX_TEXT_CHARS = 120_000

// .xls / .ods / .numbers : non gérés (à enregistrer en .xlsx ou .csv depuis le tableur).
export const ACCEPTED_EXTENSIONS = ['csv', 'tsv', 'txt', 'xlsx', 'xlsm', 'json', 'pdf', 'png', 'jpg', 'jpeg', 'webp'] as const

export type FileKind = 'text' | 'spreadsheet' | 'pdf' | 'image' | 'unknown'

export function fileKind(filename: string, mime: string): FileKind {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  if (['csv', 'tsv', 'txt', 'json', 'md'].includes(ext) || mime.startsWith('text/') || mime === 'application/json') return 'text'
  if (['xlsx', 'xlsm'].includes(ext) || mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel.sheet.macroenabled.12') return 'spreadsheet'
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) || mime.startsWith('image/')) return 'image'
  return 'unknown'
}
