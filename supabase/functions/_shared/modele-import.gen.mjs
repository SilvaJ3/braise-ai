// Génère `modele-import.ts` depuis le fichier que l'artisan télécharge vraiment.
// Source unique : `public/modele-import-braaise.xlsx`. NE PAS ÉDITER `modele-import.ts` À LA MAIN.
//
// Pourquoi embarquer les octets dans une fonction edge : au déploiement, le CLI Supabase ne
// transporte que les modules importés — un fichier lu sur le disque n'existe pas côté serveur.
// Le base64 est donc recopié dans le module, exactement comme les polices du bon de dépôt.
//
// Régénération :  node supabase/functions/_shared/modele-import.gen.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const source = resolve(ici, '../../../public/modele-import-braaise.xlsx')
const cible = resolve(ici, 'modele-import.ts')

const b64 = readFileSync(source).toString('base64')
const lignes = []
for (let i = 0; i < b64.length; i += 96) lignes.push(`  '${b64.slice(i, i + 96)}' +`)

const sortie = `// Modèle d'import embarqué pour la pièce jointe du mail d'accueil.
//
// NE PAS ÉDITER À LA MAIN : ce fichier est GÉNÉRÉ depuis le fichier que l'artisan télécharge,
// \`public/modele-import-braaise.xlsx\`. Régénération :
//   node supabase/functions/_shared/modele-import.gen.mjs
//
// Embarqué en base64 parce qu'au déploiement d'une fonction edge, seul ce qui est importé part :
// un fichier lu sur le disque n'existe pas côté serveur. Même raison que les polices du bon.
//
// Le contenu est vérifié par \`modele-import.test.ts\` avec le lecteur XLSX du produit.

export const MODELE_IMPORT_NOM = 'modele-import-braaise.xlsx'

export const MODELE_IMPORT_B64 =
${lignes.join('\n').replace(/ \+$/, '')}
`

writeFileSync(cible, sortie)
console.log(`${cible} : ${b64.length} caractères de base64 (${readFileSync(source).length} octets lus)`)
