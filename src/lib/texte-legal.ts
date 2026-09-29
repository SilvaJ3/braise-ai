// Lecture du texte des pages légales : module PUR, donc testable sans navigateur.
//
// Le format est volontairement pauvre (voir `src/content/legal.ts`) : `## ` ouvre une section,
// `- ` une puce, le reste est un paragraphe. Aucun moteur de markdown n'est embarqué pour deux
// pages statiques — et ce qui n'est pas embarqué ne casse pas.
//
// `provisoire` : tant qu'un crochet `[...]` subsiste dans le texte, la page le dit en clair.
// C'est ce qui empêche de publier des mentions légales sans identité d'éditeur.

export type Bloc =
  | { type: 'titre'; texte: string }
  | { type: 'para'; texte: string }
  | { type: 'point'; texte: string }

export function blocs(texte: string): Bloc[] {
  const sortie: Bloc[] = []
  for (const brute of texte.split('\n')) {
    const ligne = brute.trim()
    if (!ligne) continue
    if (ligne.startsWith('## ')) sortie.push({ type: 'titre', texte: ligne.slice(3).trim() })
    else if (ligne.startsWith('- ')) sortie.push({ type: 'point', texte: ligne.slice(2).trim() })
    else if (ligne.startsWith('#')) continue // niveau de titre non utilisé
    else sortie.push({ type: 'para', texte: ligne })
  }
  return sortie
}

/** Un titre de document : la première section, pour l'en-tête de page. */
export function titreDocument(texte: string): string | null {
  const premier = blocs(texte).find((b) => b.type === 'titre')
  return premier?.texte ?? null
}

/** Ce qui reste à remplir avant publication, tel quel : `[ADRESSE DE CONTACT]`, `[BCE]`… */
export function aCompleter(texte: string): string[] {
  const trouves = texte.match(/\[[^\]]+\]/g) ?? []
  return [...new Set(trouves)]
}

/** Vrai tant que le document n'est pas publiable : une page légale sans éditeur n'en est pas une. */
export function estProvisoire(texte: string): boolean {
  return aCompleter(texte).length > 0
}

/** Les sections, dans l'ordre, chacune avec ses blocs — ce que la page affiche. */
export function sections(texte: string): { titre: string | null; blocs: Bloc[] }[] {
  const sortie: { titre: string | null; blocs: Bloc[] }[] = []
  for (const bloc of blocs(texte)) {
    if (bloc.type === 'titre') sortie.push({ titre: bloc.texte, blocs: [] })
    else {
      if (!sortie.length) sortie.push({ titre: null, blocs: [] })
      sortie[sortie.length - 1].blocs.push(bloc)
    }
  }
  return sortie
}
