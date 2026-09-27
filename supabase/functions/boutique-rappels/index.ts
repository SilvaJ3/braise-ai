// Les deux mails du lien boutique : le point du 1er, la relance du 5.
//
// Ce que cette fonction NE fait pas, et c'est le principal : elle n'envoie rien tant que le
// réglage `rappels_boutiques_actifs` (`reglages_produit`) ne vaut pas 'oui'. Un cron qui existe et
// n'envoie rien est plus honnête qu'un envoi décidé à la place de l'artisan.
//
// Elle est appelée par pg_cron (07:00 UTC, tous les jours) avec l'en-tête `x-cron-secret`, vérifié
// en base (`verify_cron_secret`) comme le fait la fonction `push` depuis 0003. Le jour décide de
// ce qui part : le 1er le point, le 5 la relance, les autres jours le rattrapage d'un envoi resté
// en panne — jamais deux fois le même mois (la table `boutique_rappels` porte la preuve).
//
// Modes :
//   quotidien → le cron : ce que la base dit de devoir envoyer, et c'est tout
//   apercu    → ce qui partirait, sans rien envoyer ni réserver (lecture seule)
//   essai     → les mêmes mails, mais TOUS vers une seule adresse ({ "email": "…" }) : c'est ainsi
//               qu'on vérifie un envoi sans écrire à une vraie boutique. Aucune trace en base.
//
// Secrets attendus : RESEND_API_KEY, MAIL_DOMAIN (les mêmes que la fonction `depot`).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { baseLienBoutique, lienBoutique } from '../_shared/lien-boutique.ts'
import { envoyerMail } from '../_shared/mailer.ts'
import { construireRappel, typeRappelDuJour, type BoutiqueRappel, type TypeRappel } from '../_shared/rappel-boutique.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()
const MAIL_DOMAIN = Deno.env.get('MAIL_DOMAIN')?.trim() || 'braaise.io'

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

async function cronAllowed(req: Request): Promise<boolean> {
  const secret = req.headers.get('x-cron-secret')
  if (!secret) return false
  const { data } = await admin.rpc('verify_cron_secret', { candidate: secret })
  return data === true
}

/** Les réglages du produit : ce qui se change en une ligne de SQL, sans redéploiement. */
async function reglages(cles: string[]): Promise<Record<string, string>> {
  const { data } = await admin.from('reglages_produit').select('cle, valeur').in('cle', cles)
  const out: Record<string, string> = {}
  for (const r of data ?? []) out[r.cle as string] = String(r.valeur ?? '')
  return out
}

/** `2026-10-01` : le mois d'envoi. 07:00 UTC tombe le même jour à Bruxelles toute l'année. */
function premierDuMois(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

type ResultatBase = {
  ok?: boolean
  erreur?: string
  mois?: string
  mois_precedent?: string
  boutiques?: BoutiqueRappel[]
}

async function lister(
  type: TypeRappel,
  mois: string,
  opts: { reserver: boolean; nouveaux: boolean },
): Promise<ResultatBase> {
  const { data, error } = await admin.rpc('rappels_boutiques_a_envoyer', {
    p_type: type,
    p_mois: mois,
    p_reserver: opts.reserver,
    p_nouveaux: opts.nouveaux,
  })
  if (error) return { erreur: error.message }
  return (data ?? {}) as ResultatBase
}

/** Une boutique, un mail : c'est la règle (un seul par mois), même quand elle a plusieurs artisans. */
function mailDeLaBoutique(b: BoutiqueRappel, type: TypeRappel, mois: string, moisPrecedent: string, base: string) {
  const lien = base ? lienBoutique(base, b.jeton) : ''
  const mail = construireRappel({
    type,
    lien,
    moisCourant: mois,
    moisPrecedent,
    partenaires: b.partenaires ?? [],
  })
  const premier = (b.partenaires ?? [])[0]
  return {
    fromName: premier?.artisan || 'Suivi des dépôts',
    // Répondre à ce mail doit joindre l'artisan, pas une boîte technique.
    replyTo: premier?.artisan_email || undefined,
    ...mail,
  }
}

function urlBoutique(base: string, b: BoutiqueRappel): string {
  return base ? lienBoutique(base, b.jeton) : ''
}

/** Le mode `apercu` : ce qui partirait, sans rien envoyer ni réserver. */
async function handleApercu(mois: string, type: TypeRappel | null) {
  const types: TypeRappel[] = type ? [type] : ['rappel', 'relance']
  const reglage = await reglages(['site_url', 'rappels_boutiques_actifs'])
  const base = baseLienBoutique(reglage.site_url)
  const sortie = []
  for (const t of types) {
    const res = await lister(t, mois, { reserver: false, nouveaux: true })
    if (res.erreur) return json({ error: res.erreur }, 500)
    sortie.push({
      type: t,
      boutiques: (res.boutiques ?? []).map((b) => ({
        lien_id: b.lien_id,
        adresse: b.email,
        a_declarer: b.a_declarer,
        lien: urlBoutique(base, b),
        partenaires: (b.partenaires ?? []).map((p) => ({
          artisan: p.artisan,
          ventes_mois: p.ventes_mois,
          reprises_mois: p.reprises_mois,
          entrees_mois: p.entrees_mois,
          restant: p.restant,
          declare_ce_mois: p.declare_ce_mois,
        })),
      })),
    })
  }
  return json({ arme: reglage.rappels_boutiques_actifs === 'oui', mois, apercu: sortie })
}

/** Le mode `essai` : les mêmes mails, tous vers une adresse choisie. Aucune trace en base. */
async function handleEssai(mois: string, typeDemande: TypeRappel | null, email: string) {
  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY absente' }, 500)
  const type: TypeRappel = typeDemande ?? 'rappel'
  const reglage = await reglages(['site_url'])
  const base = baseLienBoutique(reglage.site_url)
  const res = await lister(type, mois, { reserver: false, nouveaux: true })
  if (res.erreur) return json({ error: res.erreur }, 500)

  const envoyes: { lien_id: string; sujet: string }[] = []
  const echecs: { lien_id: string; erreur: string }[] = []
  for (const b of res.boutiques ?? []) {
    const mail = mailDeLaBoutique(b, type, res.mois ?? mois, res.mois_precedent ?? mois, base)
    try {
      await envoyerMail(
        { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
        {
          fromName: mail.fromName,
          replyTo: mail.replyTo,
          to: [email],
          subject: `[essai] ${mail.subject}`,
          text: mail.text,
          html: mail.html,
        },
      )
      envoyes.push({ lien_id: b.lien_id, sujet: mail.subject })
    } catch (e) {
      echecs.push({ lien_id: b.lien_id, erreur: String((e as Error).message ?? e).slice(0, 200) })
    }
  }
  return json({ mode: 'essai', vers: email, type, mois: res.mois, envoyes, echecs })
}

/** Le mode `quotidien` : le seul qui envoie à une boutique. Armé par un réglage. */
async function handleQuotidien(mois: string, jour: number) {
  const reglage = await reglages(['site_url', 'rappels_boutiques_actifs'])
  const base = baseLienBoutique(reglage.site_url)
  const dujour = typeRappelDuJour(jour)

  if (reglage.rappels_boutiques_actifs !== 'oui') {
    // On dit quand même ce qui attend : un cron silencieux qui n'envoie rien doit se voir.
    const enAttente: Record<string, number> = {}
    for (const t of ['rappel', 'relance'] as TypeRappel[]) {
      const res = await lister(t, mois, { reserver: false, nouveaux: true })
      enAttente[t] = (res.boutiques ?? []).length
    }
    return json({ desactive: true, jour, type_du_jour: dujour, en_attente: enAttente, armer: 'rappels_boutiques_actifs = oui' })
  }

  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY absente' }, 500)
  if (!base) return json({ error: "l'adresse de la page (reglages_produit.site_url) est introuvable" }, 500)

  const resultats = []
  for (const type of ['rappel', 'relance'] as TypeRappel[]) {
    // Le jour ne décide que des NOUVEAUX envois ; le rattrapage d'un échec, lui, se fait tous les
    // jours — sinon un service de mail en panne le 1er ferait perdre le rappel du mois.
    const res = await lister(type, mois, { reserver: true, nouveaux: type === dujour })
    if (res.erreur) {
      resultats.push({ type, erreur: res.erreur })
      continue
    }
    let envoyes = 0
    const echecs: string[] = []
    for (const b of res.boutiques ?? []) {
      const mail = mailDeLaBoutique(b, type, res.mois ?? mois, res.mois_precedent ?? mois, base)
      let erreur: string | null = null
      try {
        await envoyerMail(
          { apiKey: RESEND_API_KEY, domain: MAIL_DOMAIN },
          {
            fromName: mail.fromName,
            replyTo: mail.replyTo,
            to: [b.email],
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          },
        )
        envoyes++
      } catch (e) {
        erreur = String((e as Error).message ?? e).slice(0, 300)
        echecs.push(`${b.lien_id}: ${erreur}`)
      }
      // La ligne est refermée dans les deux cas : envoyée, elle porte la date (le mois est clos pour
      // cette boutique) ; en échec, elle garde la raison et reste reprenable demain.
      await admin.rpc('marquer_rappel_boutique', {
        p_lien: b.lien_id,
        p_mois: res.mois ?? mois,
        p_type: type,
        p_destinataire: b.email,
        p_erreur: erreur,
      })
    }
    resultats.push({ type, du_jour: type === dujour, envoyes, echecs })
  }
  return json({ jour, type_du_jour: dujour, resultats })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST uniquement' }, 405)

  try {
    if (!(await cronAllowed(req))) return json({ error: 'non autorisé' }, 401)

    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>
    const mode = typeof body.mode === 'string' ? body.mode : 'apercu'
    const maintenant = new Date()
    const mois = premierDuMois(maintenant)
    const jour = maintenant.getUTCDate()

    if (mode === 'apercu') return await handleApercu(mois, (body.type as TypeRappel) ?? null)
    if (mode === 'essai') {
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      if (!email) return json({ error: 'email requis en mode essai' }, 400)
      return await handleEssai(mois, (body.type as TypeRappel) ?? null, email)
    }
    if (mode === 'quotidien') return await handleQuotidien(mois, jour)
    return json({ error: `mode inconnu: ${mode}` }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500)
  }
})
