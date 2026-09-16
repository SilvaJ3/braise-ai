import { useNavigate } from 'react-router-dom'
import {
  coutEstimeEur,
  PLANS,
  quotaImports,
  quotaQuestions,
} from '../../supabase/functions/_shared/compte'
import { useMonCompte } from '../lib/profil'

// Ce que le compte consomme : c'est le plafond vendu (questions incluses), pas une statistique
// décorative. Tout vient de la base (`mon_compte()`), sous la RLS du compte : l'écran ne peut
// pas afficher autre chose que ce qui est réellement compté côté serveur.
export default function CompteMonCompte() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useMonCompte()

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
  const cout = coutEstimeEur(Number(data.input_tokens), Number(data.output_tokens))
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
            mois et {PLANS.mensuel.imports} imports de fichiers — écris-moi quand tu veux passer à
            l'une d'elles.
          </p>
        )}
      </div>

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
            chez son fournisseur de modèle, utile pendant les premiers mois. */}
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.78rem' }}>
          Détail : {Number(data.input_tokens).toLocaleString('fr-BE')} jetons en entrée,{' '}
          {Number(data.output_tokens).toLocaleString('fr-BE')} en sortie, sur {data.appels} appel
          {data.appels > 1 ? 's' : ''} au modèle — environ {cout.toFixed(2).replace('.', ',')} €.
        </p>
      </div>

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Le plan, les quotas et le paiement se règlent à la main pour l'instant : envoie-moi un
        message et c'est fait le jour même.
      </p>
    </>
  )
}
