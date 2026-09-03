import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  // Affiché tel quel dans la page : sans ça, écran blanc + erreur seulement en console.
  const msg = 'Configuration manquante : VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (voir .env.example)'
  const root = document.getElementById('root')
  if (root) root.textContent = msg
  throw new Error(msg)
}

export const supabase = createClient(url, key)

export type ContentStatus = 'idee' | 'a_faire' | 'planifie' | 'publie'
export type ContentType = 'post' | 'story' | 'reel'
export type Platform = 'instagram' | 'facebook' | 'tiktok'

export type ContentEntry = {
  id: string
  user_id: string
  title: string
  product: string | null
  type: ContentType | null
  platform: Platform | null
  date: string | null
  scheduled_time: string | null
  reminder_lead_hours: number | null
  notes: string | null
  status: ContentStatus
  reminder_at: string | null
  reminder_sent_at: string | null
  source: 'manuel' | 'assistant'
  perf: 'carton' | 'ok' | 'bof' | null
  boutique_id: string | null
  created_at: string
}

export type Saison = 'toute_annee' | 'printemps' | 'ete' | 'automne' | 'hiver' | 'noel'

export type Produit = {
  id: string
  user_id: string
  nom: string
  senteur: string | null
  description: string | null
  prix_vente: number | null
  saison: Saison | null
  actif: boolean
  created_at: string
}

export type ProduitDraft = Omit<Produit, 'id' | 'user_id' | 'created_at'>

export type AssistantSuggestion = {
  id: string
  user_id: string
  type: 'idee_contenu' | 'observation' | 'relance_boutique' | 'alerte_stock'
  message: string
  source_id: string | null
  boutique_id: string | null
  matiere_id: string | null
  statut: 'nouveau' | 'vu' | 'traite'
  created_at: string
}

export type CanalContact = 'email' | 'telephone' | 'instagram' | 'visite' | 'autre'

export type Boutique = {
  id: string
  user_id: string
  nom: string
  adresse: string | null
  horaires: Record<string, string> | null
  canal_prefere: CanalContact | null
  email: string | null
  telephone: string | null
  notes: string | null
  actif: boolean
  lat: number | null
  lng: number | null
  created_at: string
}

export type BoutiqueDraft = Omit<Boutique, 'id' | 'user_id' | 'created_at'>

export type BoutiqueContactLog = {
  id: string
  user_id: string
  boutique_id: string
  date: string
  canal: CanalContact | null
  resume: string | null
  created_at: string
}

export type BoutiqueContactLogDraft = Omit<
  BoutiqueContactLog,
  'id' | 'user_id' | 'created_at'
>

export type ContentEntryDraft = Omit<
  ContentEntry,
  'id' | 'user_id' | 'created_at' | 'source' | 'reminder_sent_at' | 'perf'
>

// --- V3 : atelier (fournisseurs, matières premières, recettes) ---

export type Fournisseur = {
  id: string
  user_id: string
  nom: string
  email: string | null
  telephone: string | null
  site_web: string | null
  delai_livraison_jours: number | null
  notes: string | null
  actif: boolean
  created_at: string
  updated_at: string
}

export type FournisseurDraft = Omit<Fournisseur, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export type Unite = 'g' | 'kg' | 'ml' | 'l' | 'piece' | 'm'
export type CategorieMatiere = 'cire' | 'meche' | 'parfum' | 'contenant' | 'colorant' | 'emballage' | 'autre'

export type MatierePremiere = {
  id: string
  user_id: string
  nom: string
  categorie: CategorieMatiere | null
  unite: Unite
  stock_actuel: number
  seuil_alerte: number | null
  prix_unitaire: number | null
  fournisseur_id: string | null
  reference_fournisseur: string | null
  notes: string | null
  actif: boolean
  created_at: string
  updated_at: string
}

export type MatierePremiereDraft = Omit<MatierePremiere, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export type ProduitRecette = {
  id: string
  user_id: string
  produit_id: string
  matiere_id: string
  quantite: number
  created_at: string
}

// --- V4 : bons de dépôt ---

export type ProfilEntreprise = {
  user_id: string
  nom: string
  adresse: string
  telephone: string
  tva: string
  email: string
  mention_signature: string
  updated_at: string
}

export type ProfilEntrepriseDraft = Omit<ProfilEntreprise, 'user_id' | 'updated_at'>

export type DepotStatut = 'brouillon' | 'signe' | 'envoye'

export type Depot = {
  id: string
  user_id: string
  boutique_id: string | null
  numero: string | null
  date_depot: string
  statut: DepotStatut
  boutique_nom: string
  boutique_adresse: string | null
  boutique_email: string | null
  notes: string | null
  signataire_nom: string | null
  signature_image: string | null
  signed_at: string | null
  pdf_path: string | null
  email_to: string[]
  email_cc: string[]
  sent_at: string | null
  send_error: string | null
  created_at: string
  updated_at: string
}

export type DepotLigneRow = {
  id: string
  user_id: string
  depot_id: string
  produit_id: string | null
  designation: string
  quantite: number
  prix_unitaire: number
  position: number
  created_at: string
}

export type ChatMessage = {
  id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  status: 'pending' | 'done' | 'error'
  meta: { added?: number }
  created_at: string
}
