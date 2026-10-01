import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  dateCompte,
  etatCompte,
  libelleBascule,
  nomCompte,
  resumeComptes,
  type CompteAdmin,
} from '../lib/admin-comptes'
import { useComptesAdmin, useEstAdmin, useReglerAccesGratuit } from '../lib/profil'

// Qui utilise Braaise gratuitement.
//
// L'écran est réservé à l'administration : la question est posée au serveur (`est_admin()`), pas
// tranchée ici, et l'écriture passe par une fonction qui refuse tout compte qui n'administre pas.
// Le client n'a aucun droit sur la colonne `acces_gratuit` (0076) : ce bouton est le seul chemin,
// et c'est ce qui rend la décision lisible — on peut montrer la liste de ceux à qui l'outil est
// offert.
//
// Ce que l'écran ne fait pas : deviner. Chaque ligne dit POURQUOI le compte a accès (offert, compte
// de test, abonné, essai), et l'état affiché est celui que le serveur appliquera — la même règle
// que celle qui ferme l'assistant.
export default function ComptesAdmin() {
  const navigate = useNavigate()
  const admin = useEstAdmin()
  const liste = useComptesAdmin(admin.data === true)
  const regler = useReglerAccesGratuit()
  const [enCours, setEnCours] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const retour = (
    <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
      ← Plus
    </button>
  )

  if (admin.isLoading || liste.isLoading) {
    return (
      <>
        {retour}
        <h1>Comptes</h1>
        <p className="muted">…</p>
      </>
    )
  }

  if (admin.data !== true) {
    return (
      <>
        {retour}
        <h1>Comptes</h1>
        <p className="muted">Cet écran est réservé à l’administration de Braaise.</p>
      </>
    )
  }

  if (liste.isError || !liste.data) {
    return (
      <>
        {retour}
        <h1>Comptes</h1>
        <p className="muted">Les comptes n’ont pas pu être lus. Réessaie dans un moment.</p>
      </>
    )
  }

  const basculer = async (c: CompteAdmin) => {
    setMessage(null)
    setEnCours(c.user_id)
    try {
      const offert = await regler.mutateAsync({ userId: c.user_id, gratuit: !c.acces_gratuit })
      setMessage(
        offert
          ? `L’accès est offert à ${nomCompte(c)} : rien ne sera prélevé.`
          : `L’accès offert est retiré à ${nomCompte(c)} : l’essai et l’abonnement décident de nouveau.`,
      )
    } catch (e) {
      // Le message du serveur s'affiche tel quel : « c'est fait » ne s'écrit jamais sans lui.
      setMessage((e as Error).message)
    } finally {
      setEnCours(null)
    }
  }

  return (
    <>
      {retour}
      <h1>Comptes</h1>
      <p className="muted">{resumeComptes(liste.data)}</p>

      {message && (
        <div className="banner">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
      )}

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        L’accès offert est une décision nominative : elle ouvre l’assistant et les imports sans
        abonnement, et rien n’est prélevé. Un compte de test est ouvert de toute façon.
      </p>

      {liste.data.map((c) => {
        const etat = etatCompte(c)
        const depuis = dateCompte(c.acces_gratuit_depuis)
        const ouvert = dateCompte(c.ouvert_le)
        return (
          <div className="card" key={c.user_id}>
            <div className="row">
              <strong>{nomCompte(c)}</strong>
              <div className="spacer" />
              <span className="badge">{etat.badge}</span>
            </div>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {etat.phrase}
            </p>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
              {ouvert ? `Compte ouvert le ${ouvert}` : 'Date d’ouverture inconnue'}
              {depuis ? ` · offert depuis le ${depuis}` : ''}
            </p>

            {etat.basculable ? (
              <button
                style={{ marginTop: 10 }}
                disabled={enCours !== null}
                onClick={() => basculer(c)}
              >
                {enCours === c.user_id ? 'Enregistrement…' : libelleBascule(c)}
              </button>
            ) : (
              <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
                Rien à régler sur ce compte : il garde l’accès quoi qu’il arrive.
              </p>
            )}
          </div>
        )
      })}
    </>
  )
}
