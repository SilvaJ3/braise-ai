import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tablesSansRls, type Migration } from '../../../src/lib/migrations-rls'

const DOSSIER = new URL('../../migrations/', import.meta.url)
const migrations: Migration[] = readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ nom: f, sql: readFileSync(new URL(f, DOSSIER), 'utf8') }))

describe('migrations : aucune table de public sans RLS', () => {
  // Exceptions : une table volontairement sans RLS doit être NOMMÉE ici, avec la raison. La liste est vide : mieux vaut la laisser
  // vide que d'y ranger une faille.
  const EXCEPTIONS: string[] = []

  it('chaque table créée dans les migrations a sa RLS activée (dans la même migration ou une suivante)', () => {
    const fautives = tablesSansRls(migrations).filter((t) => !EXCEPTIONS.includes(t.table))
    expect(fautives, `Tables sans « enable row level security » : ${JSON.stringify(fautives)}`).toEqual([])
  })

  it('le détecteur voit bien une table oubliée (cas de la 0063), et accepte une RLS posée plus tard ou une table supprimée', () => {
    const oubli = [{ nom: '0063.sql', sql: 'create table if not exists public.releve_numeros (annee int primary key, dernier int not null);' }]
    expect(tablesSansRls(oubli)).toEqual([{ table: 'releve_numeros', migration: '0063.sql' }])
    expect(tablesSansRls([...oubli, { nom: '0083.sql', sql: 'alter table public.releve_numeros enable row level security;' }])).toEqual([])
    expect(tablesSansRls([...oubli, { nom: '0090.sql', sql: 'drop table if exists public.releve_numeros;' }])).toEqual([])
  })

  it('ignore les commentaires et reconnaît la RLS écrite dans la même migration', () => {
    const sql = `-- create table public.fantome (id int);
      create table public.reel (id uuid primary key);
      alter table public.reel enable row level security;`
    expect(tablesSansRls([{ nom: 'a.sql', sql }])).toEqual([])
  })

  it('sur les VRAIES migrations, sans la 0083 le contrôle aurait signalé releve_numeros (la faille d’origine)', () => {
    const sans0083 = migrations.filter((m) => !m.nom.includes('_0083_'))
    expect(tablesSansRls(sans0083).map((t) => t.table)).toContain('releve_numeros')
  })
})
