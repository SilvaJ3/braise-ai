import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { etapesDemarrage, useEtatDemarrage, useFermerDemarrage } from '../lib/demarrage'
import { logEvent } from '../lib/events'
import { useProfilCompte } from '../lib/profil'

// « Pour démarrer » : ce qui manque encore au compte pour que l'app serve à quelque chose. Les
// étapes viennent des données (voir lib/demarrage.ts), jamais d'un « déjà vu » : chacune s'efface
// quand elle est vraiment faite, la carte s'efface à la dernière, et on peut la masquer pour de bon.
//
// Une seule ligne de journal par situation et par session : l'écran d'accueil se remonte à chaque
// retour sur l'onglet, et noyer app_events ne mesurerait plus rien.
let derniereSituation: string | null = null

export default function Demarrage() {
  const navigate = useNavigate()
  const { data: profil, isLoading: profilEnCours } = useProfilCompte()
  const [masquee, setMasquee] = useState(false)
  const fermer = useFermerDemarrage()

  // Rien à compter tant que la carte est écartée : un compte qui a déjà tout rempli ne doit pas
  // payer quatre requêtes à chaque ouverture de l'app.
  const utile = profil != null && profil.demarrage_ferme_at == null && !masquee
  const { etat, isLoading } = useEtatDemarrage(utile)
  const etapes = useMemo(() => etapesDemarrage(etat), [etat])

  const situation = utile ? String(etapes.length) : null
  useEffect(() => {
    if (situation === null || situation === derniereSituation) return
    derniereSituation = situation
    if (etapes.length === 0) logEvent('demarrage_termine')
    else logEvent('demarrage_vu', { restant: etapes.length, prochaine: etapes[0].cle })
  }, [situation, etapes])

  async function masquer() {
    setMasquee(true) // l'écran se libère tout de suite ; si l'écriture échoue, la carte revient
    try {
      await fermer.mutateAsync()
      logEvent('demarrage_masque', { restant: etapes.length })
    } catch {
      setMasquee(false)
    }
  }

  if (profilEnCours || isLoading || !utile || etapes.length === 0) return null

  return (
    <div className="card">
      <div className="row">
        <strong>Pour démarrer</strong>
        <div className="spacer" />
        <button className="link" type="button" onClick={masquer} disabled={fermer.isPending}>
          Masquer
        </button>
      </div>
      <p className="muted" style={{ margin: '6px 0 10px' }}>
        {etapes.length === 1
          ? 'Une dernière chose, et Braaise a de quoi travailler.'
          : `${etapes.length} choses, et Braaise a de quoi travailler.`}
      </p>

      {/* De vrais <button> : la ligne entière est la cible tactile, elle est focalisable au
          clavier et annoncée comme bouton — un <div onClick> n'est ni l'un ni l'autre. */}
      {etapes.map((e) => (
        <button
          key={e.cle}
          className="demarrage-etape"
          type="button"
          onClick={() => {
            logEvent('demarrage_clic', { cle: e.cle })
            navigate(e.vers, { state: e.etat })
          }}
        >
          <span className="row">
            <strong>{e.titre}</strong>
            <span className="spacer" />
            <span className="muted">{e.action} →</span>
          </span>
          <span className="muted demarrage-detail">{e.detail}</span>
        </button>
      ))}
    </div>
  )
}
