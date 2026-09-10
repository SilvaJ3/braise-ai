#!/usr/bin/env node
// Régénère ../fonts.ts à partir des .ttf de ce dossier. Voir README.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const files = [
  ['PUBLIC_SANS_REGULAR', 'PublicSans-Regular.ttf'],
  ['PUBLIC_SANS_SEMIBOLD', 'PublicSans-SemiBold.ttf'],
  ['PUBLIC_SANS_BOLD', 'PublicSans-Bold.ttf'],
  ['SOURCE_SERIF_BOLD', 'SourceSerif4-Bold.ttf'],
  ['SOURCE_SERIF_ITALIC', 'SourceSerif4-Italic.ttf'],
]

const WIDTH = 120
const lines = [
  '// Polices embarquées pour le bon de dépôt (sous-ensemble WinAnsi, licence SIL OFL).',
  '// Générées depuis Google Fonts (Public Sans, Source Serif 4), sous-ensemble via fonttools :',
  '// seuls les points de code couverts par WinAnsiEncoding sont conservés (~140 Ko au total).',
  '// Régénération : voir supabase/functions/_shared/fonts/README.md — NE PAS ÉDITER À LA MAIN.',
  '',
]
for (const [name, file] of files) {
  const b64 = readFileSync(join(here, file)).toString('base64')
  lines.push(`export const ${name}_B64 =`)
  for (let i = 0; i < b64.length; i += WIDTH) lines.push(`  '${b64.slice(i, i + WIDTH)}' +`)
  lines[lines.length - 1] = lines[lines.length - 1].slice(0, -2)
  lines.push('')
}

writeFileSync(join(here, '..', 'fonts.ts'), lines.join('\n') + '\n')
console.log('fonts.ts régénéré.')
