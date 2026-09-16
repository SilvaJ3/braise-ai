// Blocs de contexte envoyés au modèle, et libellés associés.
//
// Module PUR : aucun accès réseau, aucune API Deno. Deux raisons — il reste testable par vitest
// comme le reste de `_shared/` (l'edge function, elle, n'est pas couverte par `npm run check`),
// et il ne doit plus porter d'identité en dur : le produit sert plusieurs artisans depuis
// l'onboarding, et l'assistant ne sait d'un compte que ce que sa ligne `assistant_profil` dit.

export type ProfilCompte = {
  metier: string | null
  nom_commercial: string | null
  ville: string | null
  pays: string | null
  /** Voix de marque : texte libre saisi par la personne. */
  contenu: string | null
}

export type Entry = {
  title: string
  platform: string | null
  type: string | null
  date: string | null
  status: string
  notes: string | null
}

export type ProduitRow = {
  nom: string
  senteur: string | null
  description: string | null
  prix_vente: number | string | null
  saison: string | null
}

export type BoutiqueRow = { id: string; nom: string; canal_prefere: string | null }
export type ContactRow = { boutique_id: string; date: string }

export type MatiereRow = {
  id: string
  nom: string
  unite: string
  stock_actuel: number
  seuil_alerte: number | null
  fournisseur: { nom: string; delai_livraison_jours: number | null } | null
}

const texte = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Identité du compte. Ne nomme jamais personne : ce que l'assistant sait vient de la ligne de
 * profil, et un profil vide doit produire une consigne de prudence, pas une invention.
 */
export function profilContext(profil: ProfilCompte | null | undefined): string {
  const metier = texte(profil?.metier)
  const nom = texte(profil?.nom_commercial)
  const ville = texte(profil?.ville)
  const pays = texte(profil?.pays) || 'Belgique'
  const voix = texte(profil?.contenu)

  const lignes = [`Tu assistes une personne qui fabrique et vend ses créations à la main (${pays}).`]
  if (nom) lignes.push(`Nom commercial : ${nom}.`)
  if (metier) lignes.push(`Activité déclarée : ${metier}.`)
  if (ville) lignes.push(`Basée à : ${ville}.`)
  if (!metier && !voix) {
    lignes.push(
      "Le profil n'est pas encore renseigné : ne rien affirmer sur son activité, ses produits, " +
        "ses canaux de vente ni son lieu, et l'inviter une fois à le compléter " +
        '(Compte → Ma voix de marque).',
    )
  }
  if (voix) lignes.push(`Voix de marque (à respecter) :\n${voix}`)
  lignes.push(
    "La personne gère son activité seule et manque de temps. Ton rôle : l'inspirer, lui proposer " +
      "des idées de contenu concrètes et actionnables, et l'accompagner dans son planning. " +
      'Sois chaleureux, direct, jamais corporate. Réponds en français.',
  )
  return lignes.join('\n')
}

export function planningContext(entries: Entry[]): string {
  if (!entries.length) {
    return "\n\nPlanning actuel :\nAucune entrée dans le planning pour le moment."
  }
  const lignes = entries.map((e) => {
    const bits = [e.date ?? 'sans date', e.status, e.platform ?? '—', e.type ?? '—']
    return `- ${e.title} (${bits.join(', ')})${e.notes ? ` — ${e.notes}` : ''}`
  })
  return `\n\nPlanning actuel :\n${lignes.join('\n')}`
}

export function produitsContext(produits: ProduitRow[]): string {
  if (!produits.length) return ''
  const lignes = produits.map((p) => {
    const bits = [
      p.senteur,
      p.prix_vente != null ? `${p.prix_vente} €` : null,
      p.saison && p.saison !== 'toute_annee' ? p.saison : null,
    ]
      .filter(Boolean)
      .join(', ')
    return `- ${p.nom}${bits ? ` (${bits})` : ''}${p.description ? ` — ${p.description}` : ''}`
  })
  return `\n\nCatalogue produits :\n${lignes.join('\n')}`
}

export function perfContext(
  perf: { title: string; perf: string | null; platform: string | null }[],
): string {
  if (!perf.length) return ''
  const label: Record<string, string> = {
    carton: 'a très bien marché',
    ok: 'correct',
    bof: 'a peu marché',
  }
  const lignes = perf.map(
    (e) => `- ${e.title}${e.platform ? ` (${e.platform})` : ''} : ${label[e.perf as string]}`,
  )
  return `\n\nRetours sur les publications passées (tiens-en compte) :\n${lignes.join('\n')}`
}

/** Date du contact le plus récent par boutique. Le tri de la requête n'est pas supposé. */
export function dernierContactParBoutique(contacts: ContactRow[]): Map<string, string> {
  const dernier = new Map<string, string>()
  for (const c of contacts) {
    const connu = dernier.get(c.boutique_id)
    if (!connu || c.date > connu) dernier.set(c.boutique_id, c.date)
  }
  return dernier
}

export function joursDepuis(dateIso: string, maintenant: number = Date.now()): number {
  return Math.floor((maintenant - new Date(`${dateIso}T00:00:00`).getTime()) / 86_400_000)
}

/** Message de la suggestion `relance_boutique`. `jours` vaut Infinity si jamais contactée. */
export function messageRelanceBoutique(nom: string, jours: number): string {
  if (!Number.isFinite(jours)) return `${nom} : jamais contactée`
  const semaines = Math.floor(jours / 7)
  return `${nom} : pas de contact depuis ${semaines} semaine${semaines > 1 ? 's' : ''}`
}

export function boutiquesContext(
  boutiques: BoutiqueRow[],
  contacts: ContactRow[],
  maintenant: number = Date.now(),
): string {
  if (!boutiques.length) return ''
  const dernier = dernierContactParBoutique(contacts)
  const lignes = boutiques.map((b) => {
    const last = dernier.get(b.id)
    const contactBit =
      last == null ? 'jamais contactée' : `dernier contact il y a ${joursDepuis(last, maintenant)} j`
    return `- ${b.nom}${b.canal_prefere ? ` (${b.canal_prefere})` : ''} — ${contactBit}`
  })
  return `\n\nBoutiques en dépôt-vente :\n${lignes.join('\n')}`
}

export const fmtQty = (n: number, unite: string): string =>
  `${Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, '')} ${unite === 'piece' ? 'pc' : unite}`

export function stockContext(matieres: MatiereRow[]): string {
  if (!matieres.length) return ''
  const sous = matieres.filter((m) => m.seuil_alerte != null && m.stock_actuel <= m.seuil_alerte)
  const lignes = matieres.map((m) => {
    const bits = [fmtQty(m.stock_actuel, m.unite)]
    if (m.seuil_alerte != null) bits.push(`seuil ${fmtQty(m.seuil_alerte, m.unite)}`)
    if (m.fournisseur?.nom) {
      bits.push(
        `chez ${m.fournisseur.nom}${m.fournisseur.delai_livraison_jours != null ? `, délai ${m.fournisseur.delai_livraison_jours} j` : ''}`,
      )
    }
    return `- ${m.nom} : ${bits.join(', ')}`
  })
  const alerte = sous.length
    ? `\nSous le seuil (à recommander) : ${sous.map((m) => m.nom).join(', ')}.`
    : ''
  return `\n\nStock de matières premières :\n${lignes.join('\n')}${alerte}`
}

/**
 * Une source illisible se dit au modèle au lieu de lui présenter un contexte vide comme un fait :
 * avant, une erreur réseau sur le planning produisait « Aucune entrée dans le planning », et le
 * modèle l'affirmait avec assurance.
 */
export function avertissementContexte(quoi: string): string {
  return `\n\n⚠︎ ${quoi} momentanément illisible : ne rien affirmer sur ce point, et le signaler dans ta réponse.`
}
