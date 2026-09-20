import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FONCTION_LABEL,
  coutConsommation,
  economieCache,
  PLANS,
  quotaImports,
  quotaQuestions,
  type Consommation,
  type Plan,
  type UsageParFonction,
} from '../../supabase/functions/_shared/compte'
import {
  alerteTarif,
  etatAbonnement,
  formuleFacturee,
  libelleSouscription,
  messagePaiement,
  noteFondateur,
  type FrequenceAbonnement,
} from '../lib/abonnement'
import { useMonCompte, useOuvrirPaiement, useOuvrirPortail } from '../lib/profil'

const nb = (n: number) => Math.round(n).toLocaleString('fr-BE')
const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`
/** Jetons d'une ligne de détail : les quatre postes comptent, mais pas au même tarif. */
const jetons = (u: UsageParFonction): number =>
  Number(u.input_tokens) + Number(u.output_tokens) + Number(u.cache_read_tokens) + Number(u.cache_write_tokens)

// Ce que le compte consomme : c'est le plafond vendu (questions incluses), pas une statistique
// décorative. Tout vient de la base (`mon_compte()`), sous la RLS du compte : l'écran ne peut
// pas afficher autre chose que ce qui est réellement compté côté serveur.
export default function CompteMonCompte() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useMonCompte()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const paiement = useOuvrirPaiement()
  const portail = useOuvrirPortail()

  // Au retour de la page de paiement, le webhook de Stripe n'a pas toujours fini d'écrire : on
  // relit le compte deux fois plutôt que d'afficher « aucun abonnement » juste après avoir payé.
  const retourPaiement = params.get('paiement')
  useEffect(() => {
    if (retourPaiement !== 'ok') return
    const relire = () => qc.invalidateQueries({ queryKey: ['mon-compte'] })
    const t1 = setTimeout(relire, 2_000)
    const t2 = setTimeout(relire, 6_000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [retourPaiement, qc])

  if (isLoading) {
    return (
      <>
        <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
          ← Compte
        </button>
        <h1>Mon compte</h1>
        <p className="muted">…</p>
      </>
    )
  }

  if (isError || !data) {
    return (
      <>
        <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
          ← Compte
        </button>
        <h1>Mon compte</h1>
        <p className="muted">Ta consommation n'a pas pu être lue. Réessaie dans un moment.</p>
      </>
    )
  }

  const infos = PLANS[data.plan]
  const quotaQ = quotaQuestions(data.plan, data.quota_derogation)
  const quotaI = quotaImports(data.plan, data.quota_derogation)
  const reste = Math.max(0, quotaQ - data.questions_utilisees)
  const detail: UsageParFonction[] = Array.isArray(data.detail)
    ? (data.detail as UsageParFonction[])
    : []
  const cacheRelu = Number(data.cache_read_tokens ?? 0)
  const recherches = Number(data.recherches_web ?? 0)
  // La consommation du mois, dans la forme commune au journal : le cache est compté à son tarif
  // (0,1x) et non au tarif plein, sinon l'écran annoncerait une facture dix fois trop grosse sur
  // les jetons relus.
  const consoMois: Consommation = {
    appels: Number(data.appels ?? 0),
    input_tokens: Number(data.input_tokens ?? 0),
    output_tokens: Number(data.output_tokens ?? 0),
    cache_read_tokens: cacheRelu,
    cache_write_tokens: Number(data.cache_write_tokens ?? 0),
    recherches_web: recherches,
  }
  const cout = coutConsommation(consoMois)
  const economie = economieCache(consoMois)
  const moisLisible = new Date(`${data.mois}T12:00:00`).toLocaleDateString('fr-BE', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
        ← Compte
      </button>
      <h1>Mon compte</h1>

      <div className="card">
        <div className="row">
          <strong>{infos.label}</strong>
          <div className="spacer" />
          {infos.prix && <span className="muted">{infos.prix}</span>}
        </div>
        {data.plan === 'essai' && (
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Tu es en essai. Les formules payantes incluent {PLANS.mensuel.questions} questions par
            mois et {PLANS.mensuel.imports} imports de fichiers — l'abonnement se prend juste en
            dessous, sans passer par moi.
          </p>
        )}
      </div>

      <Abonnement
        plan={data.plan}
        statut={data.abonnement_statut}
        fin={data.abonnement_fin}
        prixCentimes={data.abonnement_prix_centimes}
        paiement={paiement}
        portail={portail}
        retour={messagePaiement(params.get('paiement'))}
      />

      <h2>Ce mois-ci ({moisLisible})</h2>
      <div className="card">
        <div className="row">
          <span>Questions</span>
          <div className="spacer" />
          <span className="muted">
            {data.questions_utilisees} sur {quotaQ}
          </span>
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span>Imports de fichiers</span>
          <div className="spacer" />
          <span className="muted">
            {data.imports_utilises} sur {quotaI}
          </span>
        </div>
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
          {reste > 0
            ? `Il te reste ${reste} question${reste > 1 ? 's' : ''}. Le compteur repart le 1er du mois prochain.`
            : "Tu as utilisé toutes tes questions du mois : écris-moi si tu en veux plus, ou attends le 1er."}
        </p>
        {/* Détail technique, volontairement discret : c'est ce que l'outil consomme réellement
            chez son fournisseur de modèle, utile pendant les premiers mois. Le cache et les
            recherches web y figurent parce qu'ils se facturent à part des jetons d'entrée/sortie :
            un total qui les ignore est faux dans les deux sens. */}
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.78rem' }}>
          Détail : {nb(Number(data.input_tokens))} jetons en entrée,{' '}
          {nb(Number(data.output_tokens))} en sortie, sur {data.appels} appel
          {data.appels > 1 ? 's' : ''} au modèle — environ {euros(cout)}.
        </p>

        {detail.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <p className="muted" style={{ margin: '0 0 4px', fontSize: '0.78rem' }}>
              Par usage :
            </p>
            {detail.map((d) => (
              <div className="row" key={d.fonction} style={{ fontSize: '0.78rem' }}>
                <span className="muted">{FONCTION_LABEL[d.fonction] ?? d.fonction}</span>
                <div className="spacer" />
                <span className="muted">
                  {d.appels} appel{d.appels > 1 ? 's' : ''} ·{' '}
                  {nb(jetons(d))} jetons · {euros(coutConsommation(d))}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.78rem' }}>
          {cacheRelu > 0
            ? `Dont ${nb(cacheRelu)} jetons relus dans le cache : ${euros(economie)} évités.`
            : 'Aucun jeton relu dans le cache ce mois-ci.'}
          {recherches > 0 && ` ${recherches} recherche${recherches > 1 ? 's' : ''} web facturée${recherches > 1 ? 's' : ''} à la part.`}
        </p>
      </div>

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Le paiement se règle depuis cet écran. Les quotas, eux, se règlent encore à la main :
        envoie-moi un message si tu en veux plus.
      </p>
    </>
  )
}


/**
 * L'abonnement : où en est le paiement, ce qu'il faut faire, et les deux portes vers Stripe.
 *
 * Rien du parcours de paiement n'est réimplémenté ici : le bouton ouvre la page hébergée par
 * Stripe (la carte ne traverse jamais l'app) et le portail est celui de Stripe aussi. L'écran ne
 * décide que de ce qu'il montre, et cette décision est dans `lib/abonnement.ts` — pure, donc
 * éprouvée sans navigateur.
 */
function Abonnement({
  plan,
  statut,
  fin,
  prixCentimes,
  paiement,
  portail,
  retour,
}: {
  plan: Plan
  statut: unknown
  fin: string | null
  prixCentimes: number | null
  paiement: ReturnType<typeof useOuvrirPaiement>
  portail: ReturnType<typeof useOuvrirPortail>
  retour: ReturnType<typeof messagePaiement>
}) {
  const etat = etatAbonnement(statut, { fin })
  const facture = formuleFacturee(prixCentimes)
  const alerte = alerteTarif(plan, prixCentimes)
  const note = etat.peutSouscrire ? noteFondateur(plan) : null
  const erreur = paiement.error?.message ?? portail.error?.message ?? null
  const rienAGerer = portail.isSuccess && !portail.data

  const souscrire = async (frequence: FrequenceAbonnement) => {
    // `assign` et non une navigation interne : la page suivante est celle de Stripe, hors de l'app.
    const url = await paiement.mutateAsync(frequence).catch(() => null)
    if (url) window.location.assign(url)
  }

  const gerer = async () => {
    const url = await portail.mutateAsync().catch(() => null)
    if (url) window.location.assign(url)
  }

  return (
    <>
      <h2>Abonnement</h2>

      {retour && (
        <div className="banner">
          <p style={{ margin: 0 }}>{retour.texte}</p>
        </div>
      )}

      <div className="card">
        <div className="row">
          <strong>{etat.badge}</strong>
          <div className="spacer" />
          {facture && <span className="badge">{facture.libelle}</span>}
        </div>

        <p className="muted" style={{ margin: '6px 0 0' }}>
          {etat.phrase}
        </p>

        {alerte && (
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {alerte}
          </p>
        )}

        {etat.peutSouscrire && (
          <>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
              Le paiement s'ouvre sur une page Stripe : ta carte ne passe pas par l'app, et tu peux
              résilier d'ici quand tu veux. Prix hors TVA.
            </p>
            {note && (
              <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>
                {note}
              </p>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="primary"
                disabled={paiement.isPending}
                onClick={() => souscrire('mois')}
              >
                {paiement.isPending ? 'Ouverture…' : libelleSouscription('mois', plan)}
              </button>
              <button disabled={paiement.isPending} onClick={() => souscrire('an')}>
                {libelleSouscription('an', plan)}
              </button>
            </div>
          </>
        )}

        {etat.peutGerer && (
          <button className="link" style={{ marginTop: 10 }} disabled={portail.isPending} onClick={gerer}>
            {portail.isPending ? 'Ouverture…' : 'Changer de carte, voir mes factures ou résilier'}
          </button>
        )}

        {rienAGerer && (
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Rien à gérer pour l'instant : aucun paiement n'a encore eu lieu sur ce compte.
          </p>
        )}

        {erreur && (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {erreur}
          </p>
        )}
      </div>
    </>
  )
}
