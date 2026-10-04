// Garde-fou contre l'alerte Supabase « rls_disabled_in_public » (04/10/2026 : `releve_numeros`, créée par la 0063 sans RLS, lisible et
// modifiable par n'importe quelle clé publique). Fonction PURE : elle lit le texte des migrations, dans l'ordre, et rend les tables
// de `public` qui n'ont JAMAIS eu leur RLS activée (ou qui ont été supprimées depuis). Voir `migrations-rls.test.ts`.

const SANS_COMMENTAIRES = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
const NOM = String.raw`(?:public\.)?"?([a-z_][a-z0-9_]*)"?`

export type Migration = { nom: string; sql: string }

export function tablesSansRls(migrations: Migration[]): { table: string; migration: string }[] {
  const creees = new Map<string, string>()
  const protegees = new Set<string>()
  for (const { nom, sql } of migrations) {
    const texte = SANS_COMMENTAIRES(sql)
    for (const m of texte.matchAll(new RegExp(String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?${NOM}\s*\(`, 'gi'))) {
      if (!creees.has(m[1]!)) creees.set(m[1]!, nom)
    }
    for (const m of texte.matchAll(new RegExp(String.raw`\balter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?${NOM}\s+enable\s+row\s+level\s+security`, 'gi'))) {
      protegees.add(m[1]!)
    }
    for (const m of texte.matchAll(new RegExp(String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?${NOM}`, 'gi'))) {
      creees.delete(m[1]!)
      protegees.delete(m[1]!)
    }
  }
  return [...creees].filter(([table]) => !protegees.has(table)).map(([table, migration]) => ({ table, migration }))
}
