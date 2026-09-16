import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChampsActivite, ChampsCanaux, VALEURS_VIDES, type ValeursProfil } from '../components/ChampsProfil'
import { logEvent } from '../lib/events'
import { useEnregistrerProfilCompte, useProfilCompte, useTerminerOnboarding, type Canaux } from '../lib/profil'

// Tunnel d'accueil : trois écrans, dans l'ordre où la question se pose. Chaque étape enregistre ce
// qu'elle a recueilli avant de passer à la suivante — une app fermée en cours de route ne fait pas
// perdre la réponse précédente. Tant qu'il n'est pas terminé, App.tsx n'ouvre aucune autre route.
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
        })
        logEvent('onboarding_etape', { etape: 1 })
        setEtape(2)
        return
      }

      if (etape === 2) {
        await enregistrer.mutateAsync({
          canaux: valeurs.canaux,
          plateformes: valeurs.canaux.includes('reseaux') ? valeurs.plateformes : [],
        })
        logEvent('onboarding_etape', { etape: 2 })
        setEtape(3)
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
      await terminer.mutateAsync()
      logEvent('onboarding_termine', { metier: valeurs.metier.trim(), avec_import: true })
      navigate('/atelier?tab=import&entity=produits', { replace: true })
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  const occupe = enregistrer.isPending || terminer.isPending

  return (
    <>
      <p className="muted" style={{ marginBottom: 4 }}>
        Étape {etape} sur 3
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
        </>
      )}

      {etape === 2 && (
        <>
          <h1>Où tu vends</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Coche tout ce qui compte, même si c'est petit. Ça évite qu'on te propose un Reel Instagram
            quand tu passes tes dimanches en marché.
          </p>
          <ChampsCanaux valeurs={valeurs} onChange={maj} />
        </>
      )}

      {etape === 3 && (
        <>
          <h1>Ton point de départ</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Si tu as déjà un fichier avec tes produits — un export de boutique en ligne, un tableau
            maison — Braaise sait le lire (Excel, CSV, PDF, photo). Sinon, tu peux commencer à la main,
            tout de suite, et importer plus tard.
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
        <button className="primary" type="button" onClick={suivant} disabled={occupe}>
          {occupe ? '…' : etape === 3 ? 'Commencer à la main' : 'Continuer'}
        </button>
      </div>

      {etape === 2 && (
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Rien ne t'oblige à cocher : tu peux passer, mais l'assistant sera plus vague.
        </p>
      )}

      {etape === 3 && (
        <div style={{ marginTop: 10 }}>
          <button className="primary" type="button" onClick={chargerCatalogue} disabled={occupe}>
            {occupe ? '…' : 'Charger mon catalogue depuis un fichier'}
          </button>
        </div>
      )}
    </>
  )
}
