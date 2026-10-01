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
  ENVELOPPE_JETONS,
  RESERVE_JETONS,
  champsEnveloppe,
  enveloppeDisponible,
  jetonsEquivalents,
  messageEnveloppeEpuisee,
  questionsIndicatives,
  soldeJetons,
} from '../../supabase/functions/_shared/enveloppe'
import { PACK_IDS, PACKS, type PackId } from '../../supabase/functions/_shared/packs'
import {
  alerteTarif,
  etatAbonnement,
  etatEssai,
  formuleFacturee,
  libelleSouscription,
  messagePaiement,
  noteFondateur,
  type FrequenceAbonnement,
} from '../lib/abonnement'
import { useAcheterPack, useMonCompte, useOuvrirPaiement, useOuvrirPortail } from '../lib/profil'

const nb = (n: number) => Math.round(n).toLocaleString('fr-BE')
const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`
/** Ce qu'une ligne de détail a coûté, dans l'unité du plafond : le jeton équivalent entrée. */
const jetons = (u: UsageParFonction): number => jetonsEquivalents(u as unknown as Consommation)

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
  const achat = useAcheterPack()

  // Au retour de la page de paiement, le webhook de Stripe n'a pas toujours fini d'écrire : on
  // relit le compte deux fois plutôt que d'afficher « aucun abonnement » juste après avoir payé.
  const retourPaiement = params.get('paiement')
  useEffect(() => {
    if (retourPaiement !== 'ok' && retourPaiement !== 'pack') return
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
  // L'essai de sept jours (0075) : c'est la première chose que le compte lit — ce qu'il lui reste,
  // et ce qui se passe après. La règle vient du module partagé avec le serveur, pas d'une copie.
  const essai = etatEssai(data.essai_fin, data.abonnement_statut, { accesGratuit: data.acces_gratuit })
  const quotaQ = quotaQuestions(data.plan, data.quota_derogation)
  const quotaI = quotaImports(data.plan, data.quota_derogation)
  // L'enveloppe en jetons (0069) : tant que la base ne la connaît pas, l'écran garde les anciens
  // compteurs de questions. Un écran qui afficherait un plafond de zéro sur une base en retard
  // ferait croire à un compte bloqué.
  const enveloppe = champsEnveloppe(data)
  const solde = enveloppe ? soldeJetons(data.plan, enveloppe.consommes, enveloppe.credits) : null
  const questionsRestantes = solde ? questionsIndicatives(solde.restant) : 0
  // La jauge, en questions : le forfait du mois et les jetons achetés mis ensemble, ce qui est
  // consommé par-dessus, et le pourcentage qui va avec. Personne ne lit 1 500 000 jetons ; tout le
  // monde lit « 60 sur 300 ». Le jeton reste en dessous, dans le détail replié.
  const questionsTotales = solde ? questionsIndicatives(solde.enveloppe + solde.credits) : 0
  const questionsUtilisees = Math.max(0, questionsTotales - questionsRestantes)
  const pourcent =
    questionsTotales > 0
      ? Math.min(100, Math.round((questionsUtilisees / questionsTotales) * 100))
      : 100
  const prochainTour = enveloppe
    ? enveloppeDisponible(data.plan, enveloppe.consommes, enveloppe.credits, RESERVE_JETONS.assistant)
    : true
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
        {essai.phrase && (
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {essai.phrase}
            {essai.enCours && (
              <>
                {' '}
                L'essai donne ce qu'un abonnement donne. Les formules payantes incluent environ{' '}
                {questionsIndicatives(ENVELOPPE_JETONS.mensuel)} questions par mois, imports de
                fichiers compris — l'abonnement se prend juste en dessous, sans passer par moi.
              </>
            )}
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
        {solde ? (
          <>
            {/* Ce qu'un artisan vient lire d'un coup d'œil : la jauge, et deux nombres qui se
                lisent sans rien connaître du produit. En questions — le jeton est une unité de
                facturation, pas de travail, et il ne dit rien à personne. */}
            <div className="row">
              <span>
                {solde.epuise
                  ? 'Forfait du mois utilisé'
                  : `Il te reste environ ${questionsRestantes} question${
                      questionsRestantes > 1 ? 's' : ''
                    }`}
              </span>
              <div className="spacer" />
              <span className="muted">
                {questionsUtilisees} sur {questionsTotales} · {pourcent} %
              </span>
            </div>

            <div
              className="jauge"
              role="progressbar"
              aria-valuenow={questionsUtilisees}
              aria-valuemin={0}
              aria-valuemax={questionsTotales}
              aria-label={`${questionsUtilisees} questions utilisées sur ${questionsTotales} ce mois-ci`}
              style={{ marginTop: 10 }}
            >
              <div className="jauge-remplie" style={{ width: `${pourcent}%` }} />
            </div>

            <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
              {solde.epuise
                ? messageEnveloppeEpuisee(solde.enveloppe + solde.credits)
                : 'Le forfait repart le 1er du mois prochain.'}
              {!solde.epuise &&
                solde.restantEnveloppe === 0 &&
                solde.restantCredits > 0 &&
                ' Le forfait du mois est utilisé : la suite est prise sur tes jetons achetés.'}
              {!solde.epuise &&
                !prochainTour &&
                " Ce qu'il reste ne suffit plus pour une question : attends le 1er, ou prends un pack."}
            </p>
          </>
        ) : (
          <>
            {/* Repli : base pas encore migrée (0069). Les anciens compteurs restent affichés, avec
                la même phrase qu'avant cette bascule. */}
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
              {data.questions_utilisees < quotaQ
                ? `Il te reste ${quotaQ - data.questions_utilisees} question${
                    quotaQ - data.questions_utilisees > 1 ? 's' : ''
                  }. Le compteur repart le 1er du mois prochain.`
                : 'Tu as utilisé toutes tes questions du mois : ça repart le 1er du mois prochain.'}
            </p>
          </>
        )}

        {/* Le détail — jetons, appels au modèle, cache, coût chez le fournisseur — est replié,
            jamais supprimé : c'est ce qui permet de vérifier une consommation, et ça doit rester
            joignable. Ce qu'un artisan lit d'un coup d'œil reste au-dessus, en questions. */}
        <details style={{ marginTop: 12 }}>
          <summary className="link" style={{ cursor: 'pointer' }}>
            Voir le détail de ce que ça consomme
          </summary>

          {solde && (
            <>
              {/* L'enveloppe du mois, en jetons : c'est l'unité dans laquelle le plafond est
                  compté côté serveur (un tour de chat enchaîne plusieurs appels, un import peut
                  sortir 16 000 jetons). Les questions ne sont qu'une traduction. */}
              <div className="row" style={{ marginTop: 10 }}>
                <span>Enveloppe du mois</span>
                <div className="spacer" />
                <span className="muted">
                  {nb(solde.enveloppe)} jetons — environ {questionsIndicatives(solde.enveloppe)}{' '}
                  questions
                </span>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <span>Consommé</span>
                <div className="spacer" />
                <span className="muted">{nb(solde.consommes)} jetons</span>
              </div>
              {solde.credits > 0 && (
                <div className="row" style={{ marginTop: 6 }}>
                  <span>Jetons achetés — restants</span>
                  <div className="spacer" />
                  <span className="muted">
                    {nb(solde.restantCredits)} sur {nb(solde.credits)}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Ce que l'outil consomme réellement chez son fournisseur de modèle. Le cache et les
              recherches web y figurent parce qu'ils se facturent à part des jetons d'entrée et de
              sortie : un total qui les ignore est faux dans les deux sens. */}
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
            {recherches > 0 &&
              ` ${recherches} recherche${recherches > 1 ? 's' : ''} web facturée${
                recherches > 1 ? 's' : ''
              } à la part.`}
          </p>
        </details>
      </div>

      {solde && <Packs acheter={achat} />}

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Le paiement se règle depuis cet écran : l'abonnement, et les jetons quand le mois ne suffit
        pas.
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

/**
 * Les packs de jetons : deux paiements uniques, qui ajoutent des jetons au mois sans toucher à
 * l'abonnement ni à son prix.
 *
 * Ce que l'écran ne fait pas : décider des jetons. Les montants affichés viennent de la table
 * partagée (`_shared/packs.ts`), la même que celle que le webhook crédite — un libellé
 * d'écran qui annoncerait autre chose que le crédit serait un mensonge, pas une coquille.
 */
function Packs({ acheter }: { acheter: ReturnType<typeof useAcheterPack> }) {
  const ouvrir = async (pack: PackId) => {
    // `assign` : la page suivante est celle de Stripe, hors de l'app.
    const url = await acheter.mutateAsync(pack).catch(() => null)
    if (url) window.location.assign(url)
  }

  return (
    <>
      <h2>Des jetons en plus</h2>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          L'enveloppe du mois repart le 1er. Un pack ajoute des jetons tout de suite : c'est un
          paiement unique, ça ne change ni ton abonnement ni son prix, et les jetons ne périment pas.
        </p>

        {PACK_IDS.map((id) => (
          <div className="row" style={{ marginTop: 12 }} key={id}>
            <span>
              <strong>{PACKS[id].titre}</strong>
              <br />
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                {PACKS[id].libelle}
              </span>
            </span>
            <div className="spacer" />
            <button disabled={acheter.isPending} onClick={() => ouvrir(id)}>
              {acheter.isPending ? 'Ouverture…' : 'Acheter'}
            </button>
          </div>
        ))}

        <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
          Le paiement s'ouvre sur une page Stripe. Prix hors TVA : la TVA est calculée au paiement
          selon ton pays, et l'autoliquidation s'applique si tu donnes ton numéro de TVA.
        </p>

        {acheter.error && (
          <p className="muted" style={{ margin: '8px 0 0' }}>
            {acheter.error.message}
          </p>
        )}
      </div>
    </>
  )
}
