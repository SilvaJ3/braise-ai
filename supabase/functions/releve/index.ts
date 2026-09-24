// Relevé facturable : le PDF qui dit à une boutique ce qu'elle doit, et l'émission du document.
//
//   apercu  → renvoie le PDF en base64, n'écrit rien (bouton « Voir le relevé »)
//   emettre → fige le relevé en base (numéro attribué par la base), range le PDF et le renvoie
//
// Le partage des rôles est celui du bon de dépôt : la base calcule et fige, la fonction met en
// page. Un relevé émis ne se recalcule jamais — c'est ce qui permet de le rouvrir à l'identique
// des mois plus tard, même si une déclaration a été écartée entre-temps.
//
// L'émission est une écriture en base (une ligne `releves_facturables`, et le rattachement des
// déclarations comptées). Rien n'est envoyé à personne : la remise à la boutique reste un geste
// de l'artisan, hors de cette fonction.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import type { Emetteur, ModeVente } from '../_shared/depot-doc.ts'
import { renderRelevePdf } from '../_shared/releve-pdf.ts'
import { releveFilename, type ReleveDoc, type ReleveLigne } from '../_shared/releve-doc.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const BUCKET = 'depots'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

/**
 * Un client qui parle AU NOM de la personne qui a appelé, pas au nom du service.
 *
 * Les fonctions `releve_a_emettre` / `releve_emettre` retrouvent l'artisan par `auth.uid()` —
 * c'est ce qui garantit qu'elles ne peuvent pas lire la boutique d'un autre. Appelées avec la clé
 * de service, `auth.uid()` est nul et elles répondent `non_connecte` : le premier appel de bout en
 * bout a rendu exactement ça. Le jeton de l'appelant est donc transmis tel quel au passage RPC.
 */
const clientUtilisateur = (jeton: string) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

const DEFAULT_EMETTEUR: Emetteur = {
  nom: '',
  adresse: '',
  telephone: '',
  tva: '',
  email: '',
  mention_signature: '',
}

async function loadEmetteur(userId: string): Promise<Emetteur> {
  const { data } = await admin
    .from('profil_entreprise')
    .select('nom, adresse, telephone, tva, email, mention_signature')
    .eq('user_id', userId)
    .maybeSingle()
  return { ...DEFAULT_EMETTEUR, ...data } as Emetteur
}

/** Ce que `releve_a_emettre` / `releve_emettre` rendent : le contenu du document, figé ou non. */
type ReleveCalcule = {
  boutique: { id: string; nom: string; adresse: string | null; email: string | null; mode: ModeVente }
  lignes: ReleveLigne[]
  total_ventes: number
  nb_pieces: number
  nb_reprises: number
  valeur_reprises: number
  nb_declarations: number
  a_valider: number
  periode_debut: string | null
  periode_fin: string | null
  dernier_numero: string | null
  dernier_emis_le: string | null
  numero?: string
}

/** Les codes d'erreur de la base, dits en français — l'app affiche la phrase telle quelle. */
const MESSAGES: Record<string, string> = {
  non_connecte: 'Session expirée — reconnecte-toi.',
  boutique_inconnue: "Cette boutique n'existe plus.",
  rien_a_facturer: 'Rien à facturer : aucune vente déclarée depuis le dernier relevé.',
}

const toBase64 = (bytes: Uint8Array): string => {
  // btoa ne prend qu'une chaîne : on découpe pour ne pas dépasser la pile sur un gros PDF.
  let s = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(s)
}

function docDepuis(calcul: ReleveCalcule, emetteur: Emetteur, numero: string | null, emisLe: string): ReleveDoc {
  return {
    numero,
    emis_le: emisLe,
    periode_debut: calcul.periode_debut,
    periode_fin: calcul.periode_fin,
    emetteur,
    boutique_nom: calcul.boutique.nom,
    boutique_adresse: calcul.boutique.adresse,
    boutique_email: calcul.boutique.email,
    mode: calcul.boutique.mode,
    lignes: calcul.lignes,
    total_ventes: calcul.total_ventes,
    nb_pieces: calcul.nb_pieces,
    nb_reprises: calcul.nb_reprises,
    valeur_reprises: calcul.valeur_reprises,
    nb_declarations: calcul.nb_declarations,
    a_valider: calcul.a_valider,
  }
}

async function handleApercu(jeton: string, userId: string, body: Record<string, unknown>): Promise<Response> {
  const boutiqueId = String(body.boutique_id ?? '')
  if (!boutiqueId) return json({ error: 'boutique manquante' }, 400)

  const { data, error } = await clientUtilisateur(jeton).rpc('releve_a_emettre', { p_boutique: boutiqueId })
  if (error) return json({ error: error.message }, 400)
  const calcul = data as ReleveCalcule & { erreur?: string }
  if (calcul?.erreur) return json({ error: MESSAGES[calcul.erreur] ?? calcul.erreur }, 400)

  const emetteur = await loadEmetteur(userId)
  const doc = docDepuis(calcul, emetteur, null, new Date().toISOString())
  try {
    return json({
      pdf_base64: toBase64(renderRelevePdf(doc)),
      filename: releveFilename(doc),
      total_ventes: calcul.total_ventes,
      nb_pieces: calcul.nb_pieces,
      nb_reprises: calcul.nb_reprises,
      valeur_reprises: calcul.valeur_reprises,
      a_valider: calcul.a_valider,
      dernier_numero: calcul.dernier_numero,
    })
  } catch (e) {
    console.error('renderRelevePdf', e)
    return json({ error: `génération du PDF impossible : ${String((e as Error).message ?? e).slice(0, 200)}` }, 500)
  }
}

async function handleEmettre(jeton: string, userId: string, body: Record<string, unknown>): Promise<Response> {
  const boutiqueId = String(body.boutique_id ?? '')
  if (!boutiqueId) return json({ error: 'boutique manquante' }, 400)

  // La base fige le contenu ET rattache les déclarations dans la même transaction : un relevé ne
  // peut pas compter deux fois les mêmes mouvements.
  const { data, error } = await clientUtilisateur(jeton).rpc('releve_emettre', { p_boutique: boutiqueId })
  if (error) return json({ error: error.message }, 400)
  const calcul = data as ReleveCalcule & { erreur?: string; releve_id?: string; numero?: string }
  if (calcul?.erreur) return json({ error: MESSAGES[calcul.erreur] ?? calcul.erreur }, 400)

  const emetteur = await loadEmetteur(userId)
  const doc = docDepuis(calcul, emetteur, calcul.numero ?? null, new Date().toISOString())

  let pdf: Uint8Array
  try {
    pdf = renderRelevePdf(doc)
  } catch (e) {
    console.error('renderRelevePdf', e)
    // Le relevé est émis : l'échec du rendu ne l'annule pas, il se retélécharge plus tard.
    return json(
      {
        error: `Relevé émis (${calcul.numero}) mais son PDF n'a pas pu être généré : ${String((e as Error).message ?? e).slice(0, 200)}`,
        numero: calcul.numero,
      },
      500,
    )
  }

  const filename = releveFilename(doc)
  const path = `${userId}/releves/${filename}`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  if (upErr) console.error('storage.upload', upErr.message)
  else if (calcul.releve_id) {
    await admin
      .from('releves_facturables')
      .update({ pdf_path: path })
      .eq('id', calcul.releve_id)
      .eq('user_id', userId)
  }

  return json({
    numero: calcul.numero,
    releve_id: calcul.releve_id,
    pdf_base64: toBase64(pdf),
    filename,
    total_ventes: calcul.total_ventes,
    nb_pieces: calcul.nb_pieces,
    nb_reprises: calcul.nb_reprises,
    valeur_reprises: calcul.valeur_reprises,
    a_valider: calcul.a_valider,
    pdf_path: upErr ? null : path,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: userData, error } = await admin.auth.getUser(token)
    if (error || !userData.user) return json({ error: 'non authentifié' }, 401)

    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const mode = body.mode ?? 'apercu'
    if (mode === 'apercu') return await handleApercu(token, userData.user.id, body)
    if (mode === 'emettre') return await handleEmettre(token, userData.user.id, body)
    return json({ error: `mode inconnu: ${mode}` }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
