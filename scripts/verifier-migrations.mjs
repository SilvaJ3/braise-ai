// Garde de nommage des migrations — attrape la derive avant qu'elle ne se produise.
//
// La CLI Supabase lit le fichier avec `^([0-9]+)_(.*)\.sql$` : la version, c'est ce qu'il y a
// avant le premier souligne, et c'est EXACTEMENT cette chaine qu'elle compare a
// `supabase_migrations.schema_migrations.version` pour decider si une migration est deja
// appliquee. Un fichier nomme `0066_xxx.sql` porte donc la version « 0066 », qui n'existe pas
// dans le registre : `supabase db push` rejoue la migration.
//
// Ce script ne regarde pas la base (il tourne sans jeton) : il verifie seulement que chaque
// fichier suit `<horodatage a 14 chiffres>_<numero>_<description>.sql`, que les versions sont
// uniques, et qu'elles sont croissantes dans l'ordre alphabetique.
import { readdirSync } from 'node:fs';

const dossier = new URL('../supabase/migrations/', import.meta.url).pathname;
const motif = /^([0-9]{14})_([0-9]{4})_(.+)\.sql$/;
const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort();
const erreurs = [];
const vues = new Map();

for (const f of fichiers) {
  const m = motif.exec(f);
  if (!m) {
    erreurs.push(`nom hors format <horodatage>_<numero>_<description>.sql : ${f}`);
    continue;
  }
  const [, version] = m;
  if (vues.has(version)) erreurs.push(`version ${version} portee par deux fichiers : ${vues.get(version)} et ${f}`);
  vues.set(version, f);
}

const versions = [...vues.keys()];
if (versions.join(',') !== [...versions].sort().join(',')) {
  erreurs.push("l'ordre des noms de fichiers n'est pas l'ordre des versions");
}

if (erreurs.length) {
  console.error(`migrations : ${erreurs.length} probleme(s)`);
  for (const e of erreurs) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`migrations : ${fichiers.length} fichiers, versions uniques et croissantes`);
