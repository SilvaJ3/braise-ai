import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChampsActivite, ChampsCanaux, VALEURS_VIDES, type ValeursProfil } from '../components/ChampsProfil'
import { useEnregistrerProfilCompte, useProfilCompte, type Canaux } from '../lib/profil'

// Ce que le tunnel d'accueil a recueilli, modifiable ensuite. Sans cet écran, une personne qui
// change de métier ou se met au dépôt-vente devrait repasser par le tunnel.
export default function CompteInformations() {
  const navigate = useNavigate()
  const { data: profil, isLoading, isError } = useProfilCompte()
  const enregistrer = useEnregistrerProfilCompte()

  const [valeurs, setValeurs] = useState<ValeursProfil>(VALEURS_VIDES)
  const [messageAccueil, setMessageAccueil] = useState('')
  const [preRempli, setPreRempli] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (preRempli || !profil) return
    setValeurs({
      metier: profil.metier ?? '',
      nomCommercial: profil.nom_commercial ?? '',
      ville: profil.ville ?? '',
      canaux: (profil.canaux ?? []) as Canaux[],
      plateformes: profil.plateformes ?? [],
    })
    setMessageAccueil(profil.message_accueil ?? '')
    setPreRempli(true)
  }, [profil, preRempli])

  async function enregistrerFormulaire() {
    setErreur(null)
    setMsg(null)
    if (!valeurs.metier.trim()) {
      setErreur("Garde ton métier rempli : c'est ce qui permet à l'assistant de te servir à quelque chose.")
      return
    }
    try {
      await enregistrer.mutateAsync({
        metier: valeurs.metier.trim(),
        nom_commercial: valeurs.nomCommercial.trim() || null,
        ville: valeurs.ville.trim() || null,
        canaux: valeurs.canaux,
        plateformes: valeurs.canaux.includes('reseaux') ? valeurs.plateformes : [],
        message_accueil: messageAccueil.trim() || null,
      })
      setMsg('Enregistré ✓')
    } catch (e) {
      setErreur((e as Error).message)
    }
  }

  return (
    <>
      <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
        ← Compte
      </button>
      <h1>Mes informations</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Ce que l'assistant sait de ton activité. Le ton, lui, se règle dans « Voix de marque ».
      </p>

      {isLoading && <p className="muted">…</p>}
      {isError && <p className="muted">Tes informations n'ont pas pu être lues. Réessaie dans un moment.</p>}

      {!isLoading && !isError && (
        <>
          <div className="card stack">
            <ChampsActivite valeurs={valeurs} onChange={(patch) => setValeurs((v) => ({ ...v, ...patch }))} />
          </div>

          <h2>Où tu vends</h2>
          <ChampsCanaux valeurs={valeurs} onChange={(patch) => setValeurs((v) => ({ ...v, ...patch }))} />

          <h2>Ton écran d'accueil</h2>
          <div className="card stack">
            <label htmlFor="message-accueil">Un mot en haut de l'accueil (optionnel)</label>
            <input
              id="message-accueil"
              value={messageAccueil}
              onChange={(e) => setMessageAccueil(e.target.value)}
              maxLength={200}
              placeholder="ex. Ici, tout se fabrique à la main."
            />
            <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              Il ne s'affiche que pour toi, en haut de l'écran « Aujourd'hui ». Laisse vide si tu
              n'en veux pas.
            </p>
          </div>

          {erreur && (
            <p className="muted" style={{ color: 'var(--accent)' }}>
              {erreur}
            </p>
          )}
          {msg && <p className="muted">{msg}</p>}

          <div style={{ marginTop: 12 }}>
            <button className="primary" type="button" onClick={enregistrerFormulaire} disabled={enregistrer.isPending}>
              {enregistrer.isPending ? '…' : 'Enregistrer'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
