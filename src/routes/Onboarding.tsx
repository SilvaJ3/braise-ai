import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ChampsActivite, ChampsCanaux, VALEURS_VIDES, type ValeursProfil } from '../components/ChampsProfil'
import { logEvent } from '../lib/events'
import { ESSAI_JOURS } from '../../supabase/functions/_shared/essai'
import { useEnregistrerProfilCompte, useProfilCompte, useTerminerOnboarding, type Canaux } from '../lib/profil'

// Tunnel d'accueil : deux écrans. Le premier dit qui est la personne (le métier suffit ; où elle
// vend est une option repliée), le second la mène à ses produits — le chemin le plus court vers le
// premier vrai résultat. Chaque étape enregistre ce qu'elle a recueilli avant de passer à la
// suivante — une app fermée en cours de route ne fait pas perdre la réponse précédente. Tant qu'il
// n'est pas terminé, App.tsx n'ouvre aucune autre route. Les sept jours d'essai ne commencent pas
// ici : ils s'ouvrent à la première vraie action (0091).
/**
 * Où va la personne une fois le tunnel terminé. Quand le profil est relu, l'écran d'onboarding est
 * démonté et la garde d'entrée (App.tsx) renvoie `/onboarding` vers l'accueil : une navigation
 * lancée depuis l'écran lui-même arrive trop tard. La destination voyage donc dans l'état de la
 * route, et c'est cette redirection qui la lit. Seule une adresse interne est suivie.
 */
export function SortieOnboarding() {
  const { state } = useLocation()
  const suite = typeof state?.suite === 'string' && /^\/(?!\/)/.test(state.suite) ? state.suite : '/'
  return <Navigate to={suite} replace />
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { data: profil } = useProfilCompte()
  const enregistrer = useEnregistrerProfilCompte()
  const terminer = useTerminerOnboarding()

  const [etape, setEtape] = useState(1)
  const [valeurs, setValeurs] = useState<ValeursProfil>(VALEURS_VIDES)
  const [preRempli, setPreRempli] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Reprise : un compte qui revient sur le tunnel retrouve ce qu'il avait déjà saisi.
  useEffect(() => {
    if (preRempli || !profil) return
    setValeurs({
      metier: profil.metier ?? '',
      nomCommercial: profil.nom_commercial ?? '',
      ville: profil.ville ?? '',
      canaux: (profil.canaux ?? []) as Canaux[],
      plateformes: profil.plateformes ?? [],
    })
    setPreRempli(true)
  }, [profil, preRempli])

  const maj = (patch: Partial<ValeursProfil>) => {
    setValeurs((v) => ({ ...v, ...patch }))
    setErreur(null)
  }

  async function suivant() {
    setErreur(null)
    try {
      if (etape === 1) {
        if (!valeurs.metier.trim()) {
          setErreur("Dis-moi en un mot ce que tu fabriques : c'est ce qui permet à l'assistant de te servir à quelque chose.")
          return
        }
        await enregistrer.mutateAsync({
          metier: valeurs.metier.trim(),
          nom_commercial: valeurs.nomCommercial.trim() || null,
          ville: valeurs.ville.trim() || null,
          canaux: valeurs.canaux,
          plateformes: valeurs.canaux.includes('reseaux') ? valeurs.plateformes : [],
        })
        logEvent('onboarding_etape', { etape: 1 })
        setEtape(2)
        return
      }

      await terminer.mutateAsync()
      logEvent('onboarding_termine', { metier: valeurs.metier.trim() })
      navigate('/', { replace: true })
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  async function chargerCatalogue() {
    setErreur(null)
    try {
      navigate('/onboarding', { replace: true, state: { suite: '/atelier?tab=import&entity=produits' } })
      await terminer.mutateAsync()
      logEvent('onboarding_termine', { metier: valeurs.metier.trim(), avec_import: true })
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  const occupe = enregistrer.isPending || terminer.isPending

  return (
    <>
      <p className="muted" style={{ marginBottom: 4 }}>
        Étape {etape} sur 2
      </p>

      {etape === 1 && (
        <>
          <h1>Ton activité</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Trois questions, et Braaise sait à qui il parle. Tu pourras tout changer dans Compte.
          </p>
          <div className="card stack">
            <ChampsActivite valeurs={valeurs} onChange={maj} />
          </div>
          <details style={{ marginTop: 12 }}>
            <summary className="link" style={{ cursor: 'pointer' }}>
              Où tu vends (facultatif)
            </summary>
            <p className="muted" style={{ margin: '8px 0' }}>
              Ça évite qu'on te propose un Reel Instagram quand tu passes tes dimanches en marché.
            </p>
            <ChampsCanaux valeurs={valeurs} onChange={maj} />
          </details>
        </>
      )}

      {etape === 2 && (
        <>
          <h1>Tes produits</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Le plus rapide : donne ta liste telle qu'elle existe. Un fichier Excel ou CSV, un export de
            ta boutique en ligne, ou simplement une photo de ta liste de prix — Braaise la lit et te
            montre ce qu'il a compris avant d'enregistrer quoi que ce soit.
          </p>
          <p className="muted">
            Rien à payer pour l'instant : tes {ESSAI_JOURS} jours d'essai commencent quand tu commences
            vraiment.
          </p>
        </>
      )}

      {erreur && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {erreur}
        </p>
      )}

      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        {etape > 1 && (
          <button className="link" type="button" onClick={() => setEtape(etape - 1)} disabled={occupe}>
            ← Retour
          </button>
        )}
        <div className="spacer" />
        {etape === 1 ? (
          <button className="primary" type="button" onClick={suivant} disabled={occupe}>
            {occupe ? '…' : 'Continuer'}
          </button>
        ) : (
          <button className="primary" type="button" onClick={chargerCatalogue} disabled={occupe}>
            {occupe ? '…' : 'Importer ma liste de produits'}
          </button>
        )}
      </div>

      {etape === 2 && (
        <p style={{ marginTop: 14 }}>
          <button className="link" type="button" onClick={suivant} disabled={occupe}>
            Je les ajouterai à la main
          </button>
        </p>
      )}
    </>
  )
}
