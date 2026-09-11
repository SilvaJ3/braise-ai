import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { disablePush, enablePush, pushStatus, sendTestPush, type PushStatus } from '../lib/push'
import { useReglages, useSaveReglages } from '../lib/reglages'

export default function CompteNotifications() {
  const navigate = useNavigate()
  const [push, setPush] = useState<PushStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState<string | null>(null)
  const { data: reglages, isLoading: reglagesLoading } = useReglages()
  const saveReglages = useSaveReglages()

  useEffect(() => {
    pushStatus().then(setPush)
  }, [])

  async function testPush() {
    setPushBusy(true)
    setPushMsg(null)
    try {
      await sendTestPush()
      setPushMsg('Notification de test envoyée.')
    } catch (e) {
      setPushMsg((e as Error).message)
    } finally {
      setPushBusy(false)
    }
  }

  async function togglePush(on: boolean) {
    setPushBusy(true)
    setPushMsg(null)
    try {
      if (on) {
        await enablePush()
        setPush('on')
      } else {
        await disablePush()
        setPush('off')
      }
    } catch (e) {
      setPushMsg((e as Error).message)
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <>
      <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
        ← Compte
      </button>
      <h1>Notifications</h1>
      <div className="card">
        {push === null && <p className="muted">…</p>}
        {push === 'unsupported' && (
          <p className="muted">
            Non disponible sur cet appareil. Sur iPhone : ajoute d'abord l'app à
            l'écran d'accueil.
          </p>
        )}
        {push === 'denied' && (
          <p className="muted">
            Bloquées. Autorise les notifications pour ce site dans les réglages du
            navigateur.
          </p>
        )}
        {push === 'off' && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Reçois le rappel de tes publications et le point hebdo de l'assistant.
            </p>
            <button className="primary" disabled={pushBusy} onClick={() => togglePush(true)}>
              {pushBusy ? '…' : 'Activer'}
            </button>
          </>
        )}
        {push === 'on' && (
          <div className="row">
            <span>Activées ✅</span>
            <div className="spacer" />
            <button className="link" disabled={pushBusy} onClick={testPush}>
              Test
            </button>
            <button className="link" disabled={pushBusy} onClick={() => togglePush(false)}>
              Désactiver
            </button>
          </div>
        )}
        {pushMsg && (
          <p className="muted" style={{ color: 'var(--accent)' }}>
            {pushMsg}
          </p>
        )}
      </div>

      <h1 style={{ marginTop: 28 }}>Atelier</h1>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Suivi du stock de matières premières et rappels de commande fournisseur. À désactiver
          si tu ne renseignes pas tes matières premières (ex. pas de gestion de stock formelle) :
          l'assistant ne proposera plus d'alerte stock ni de rappel de commande fournisseur.
        </p>
        {reglagesLoading || !reglages ? (
          <p className="muted">…</p>
        ) : (
          <div className="row">
            <span>Synchro produits ↔ matières premières</span>
            <div className="spacer" />
            <button
              className="link"
              disabled={saveReglages.isPending}
              onClick={() =>
                saveReglages.mutate({ sync_produits_matieres: !reglages.sync_produits_matieres })
              }
            >
              {saveReglages.isPending ? '…' : reglages.sync_produits_matieres ? 'Activée ✅' : 'Désactivée'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
