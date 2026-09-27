import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Marche, type MarcheDraft, type MarcheLigneRow, type Produit } from './supabase'
import { produitDuCatalogue } from './marche-produit'

const MARCHES_KEY = ['marches']
const VENTES_KEY = ['marches', 'ventes']

export function useMarches() {
  return useQuery({
    queryKey: MARCHES_KEY,
    queryFn: async (): Promise<Marche[]> => {
      const { data, error } = await supabase.from('marches').select('*').order('date_marche', { ascending: false })
      if (error) throw error
      return data as Marche[]
    },
  })
}

export function useMarche(id: string | undefined) {
  return useQuery({
    queryKey: [...MARCHES_KEY, 'un', id ?? ''],
    enabled: !!id,
    queryFn: async (): Promise<{ marche: Marche; lignes: MarcheLigneRow[] } | null> => {
      const { data, error } = await supabase.from('marches').select('*').eq('id', id as string).maybeSingle()
      if (error) throw error
      if (!data) return null
      const { data: lignes, error: e2 } = await supabase
        .from('marche_lignes')
        .select('*')
        .eq('marche_id', id as string)
        .order('position')
      if (e2) throw e2
      return { marche: data as Marche, lignes: (lignes ?? []) as MarcheLigneRow[] }
    },
  })
}

export function useCreateMarche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: MarcheDraft): Promise<string> => {
      const { data, error } = await supabase
        .from('marches')
        .insert({ nom: draft.nom.trim(), lieu: draft.lieu.trim(), date_marche: draft.date_marche, notes: draft.notes?.trim() || null })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MARCHES_KEY }),
  })
}

export function useUpdateMarche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MarcheDraft> }) => {
      const { error } = await supabase.from('marches').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MARCHES_KEY }),
  })
}

/** Ouvre / clôture le marché. Une fois clôturé, les lignes ne sont plus modifiables. */
export function useClonturerMarche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, cloturer }: { id: string; cloturer: boolean }) => {
      const { error } = await supabase.from('marches').update({ statut: cloturer ? 'cloture' : 'ouvert' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MARCHES_KEY }),
  })
}

export function useDeleteMarche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marches').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MARCHES_KEY }),
  })
}

/**
 * Vend une unité d'un produit du catalogue : incrémente la ligne existante du marché si elle
 * existe déjà, sinon en crée une à quantité 1. C'est le geste répété tout au long du marché,
 * donc pas de nouvelle ligne à chaque vente.
 */
export function useVendreProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ marcheId, produit }: { marcheId: string; produit: Produit; existante?: MarcheLigneRow }) => {
      // Enregistré par la base, en une instruction : l'ancien calcul « quantite + 1 » depuis
      // les données du cache perdait une vente dès que deux taps arrivaient avant le refetch.
      const { error } = await supabase.rpc('vendre_produit_marche', {
        p_marche: marcheId,
        p_produit: produit.id,
        p_designation: produit.nom,
        p_prix: Number(produit.prix_vente ?? 0),
      })
      if (error) throw error
    },
    onSuccess: (_d, { marcheId }) =>
      qc.invalidateQueries({ queryKey: [...MARCHES_KEY, 'un', marcheId] }).then(() => qc.invalidateQueries({ queryKey: VENTES_KEY })),
  })
}

/**
 * Ajoute au marché un article qui n'est pas encore au catalogue. Le produit y entre au passage,
 * avec son prix : il se retrouve donc dans « Mes produits », proposé sur un bon de dépôt, dans une
 * commande et au marché suivant. Pas de ligne orpheline — l'article vendu existe vraiment.
 *
 * Le prix de la ligne est figé à sa création par la fonction de base (même règle que sur un bon de
 * dépôt) : si le produit existait déjà et qu'il a déjà une ligne dans ce marché, la quantité
 * s'incrémente et l'ancien prix reste — c'est le prix du premier ajout qui fait foi.
 */
export function useAjouterProduitMarche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      marcheId,
      nom,
      prix,
      produits,
    }: {
      marcheId: string
      nom: string
      prix: number
      produits: Produit[]
    }) => {
      const existant = produitDuCatalogue(produits, nom)
      let produitId = existant?.id ?? null

      if (!produitId) {
        const { data, error } = await supabase
          .from('produits')
          .insert({ nom: nom.trim(), prix_vente: prix })
          .select('id')
          .single()
        if (error) throw error
        produitId = data.id as string
      }

      const { error: e2 } = await supabase.rpc('vendre_produit_marche', {
        p_marche: marcheId,
        p_produit: produitId,
        p_designation: nom.trim(),
        p_prix: prix,
      })
      if (e2) {
        // La vente n'est pas enregistrée : le produit créé ne doit pas rester seul au catalogue,
        // sinon l'artisan y trouve un article qu'il n'a jamais vendu.
        if (!existant) await supabase.from('produits').delete().eq('id', produitId)
        throw e2
      }
    },
    onSuccess: (_d, { marcheId }) =>
      qc
        .invalidateQueries({ queryKey: [...MARCHES_KEY, 'un', marcheId] })
        .then(() => qc.invalidateQueries({ queryKey: VENTES_KEY }))
        .then(() => qc.invalidateQueries({ queryKey: ['produits'] })),
  })
}

/** Corrige une quantité (erreur de saisie) ou retire la ligne si elle retombe à zéro. */
export function useAjusterLigne() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ligne, delta }: { ligne: MarcheLigneRow; delta: number }) => {
      // L'incrément est calculé par la base : deux taps rapprochés ne s'écrasent plus.
      const { data, error } = await supabase.rpc('ajuster_quantite_marche', {
        p_ligne: ligne.id,
        p_delta: delta,
      })
      if (error) throw error
      // La ligne tombe à zéro : on la retire du registre, comme avant.
      if (Number(data) === 0) {
        const { error: delErr } = await supabase.from('marche_lignes').delete().eq('id', ligne.id)
        if (delErr) throw delErr
      }
    },
    onSuccess: (_d, { ligne }) =>
      qc.invalidateQueries({ queryKey: [...MARCHES_KEY, 'un', ligne.marche_id] }).then(() => qc.invalidateQueries({ queryKey: VENTES_KEY })),
  })
}

export function useNoteLigne() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; marcheId: string; note: string }) => {
      const { error } = await supabase.from('marche_lignes').update({ note: note.trim() || null }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, { marcheId }) => qc.invalidateQueries({ queryKey: [...MARCHES_KEY, 'un', marcheId] }),
  })
}

export type VenteAgregee = {
  produit_id: string | null
  designation: string
  senteur: string | null
  quantite: number
  chiffre_affaires: number
  lieux: Record<string, number> // lieu -> quantité, pour voir où ça marche le mieux
}

/**
 * Agrège toutes les ventes des marchés clôturés par produit (+ senteur, l'équivalent d'une
 * variante ici) et par lieu, pour repérer ce qui marche bien et où.
 */
export function useVentesAgregees() {
  return useQuery({
    queryKey: VENTES_KEY,
    queryFn: async (): Promise<VenteAgregee[]> => {
      const { data, error } = await supabase
        .from('marche_lignes')
        .select('produit_id, designation, quantite, prix_unitaire, marches!inner(lieu, statut), produits(senteur)')
        .eq('marches.statut', 'cloture')
      if (error) throw error

      const parLigne = new Map<string, VenteAgregee>()
      for (const row of (data ?? []) as unknown as Array<{
        produit_id: string | null
        designation: string
        quantite: number
        prix_unitaire: number
        marches: { lieu: string } | { lieu: string }[]
        produits: { senteur: string | null } | { senteur: string | null }[] | null
      }>) {
        const marcheInfo = Array.isArray(row.marches) ? row.marches[0] : row.marches
        const produitInfo = Array.isArray(row.produits) ? row.produits[0] : row.produits
        const lieu = marcheInfo?.lieu ?? '—'
        const cle = row.produit_id ?? `libre:${row.designation}`
        const existante = parLigne.get(cle)
        const qte = Number(row.quantite)
        const ca = qte * Number(row.prix_unitaire)
        if (existante) {
          existante.quantite += qte
          existante.chiffre_affaires += ca
          existante.lieux[lieu] = (existante.lieux[lieu] ?? 0) + qte
        } else {
          parLigne.set(cle, {
            produit_id: row.produit_id,
            designation: row.designation,
            senteur: produitInfo?.senteur ?? null,
            quantite: qte,
            chiffre_affaires: ca,
            lieux: { [lieu]: qte },
          })
        }
      }
      return [...parLigne.values()].sort((a, b) => b.quantite - a.quantite)
    },
  })
}
