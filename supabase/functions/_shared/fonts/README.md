# Polices du bon de dépôt

TTF sources pour `../fonts.ts` (embarquées telles quelles dans le PDF via `FontFile2`,
cf. `pdf-lite.ts`). Origine : Google Fonts, licence SIL Open Font License.

- `PublicSans-Regular.ttf` / `-SemiBold.ttf` / `-Bold.ttf` — corps de texte, labels, tableau.
- `SourceSerif4-Bold.ttf` / `-Italic.ttf` — nom de marque, titre, mention légale.

## Sous-ensemble

Chaque fichier est un sous-ensemble ne conservant que les points de code couverts par
`WinAnsiEncoding` (celui utilisé par `toWinAnsi()` dans `pdf-lite.ts`) : ASCII, Latin-1,
et les quelques caractères spéciaux (€ « » — … etc.). Ça ramène chaque fichier à
18-25 Ko au lieu de plusieurs centaines. Regénérer un sous-ensemble (par ex. après avoir
changé de poids ou de police) :

```sh
pip install fonttools
UNI="U+0000-00FF,U+0152,U+0153,U+0160,U+0161,U+0178,U+017D,U+017E,U+0192,U+02C6,U+02DC,\
U+2013,U+2014,U+2018,U+2019,U+201A,U+201C,U+201D,U+201E,U+2020,U+2021,U+2022,U+2026,\
U+2030,U+2039,U+203A,U+20AC,U+2122"
python3 -m fontTools.subset SOURCE.ttf --unicodes="$UNI" --output-file=DEST.ttf \
  --layout-features='' --no-hinting --desubroutinize --drop-tables+=DSIG
```

(Les fichiers sources Google Fonts sont distribués en `.woff` ; `fonttools.subset` les lit
directement et réécrit en TTF brut tant qu'aucun `--flavor` n'est précisé.)

## Régénérer fonts.ts

Après avoir mis à jour un `.ttf` ici :

```sh
node supabase/functions/_shared/fonts/gen.mjs
```
