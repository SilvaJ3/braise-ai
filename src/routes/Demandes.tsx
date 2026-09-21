import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  dateDemande,
  demandesATraiter,
  demandesTraitees,
  libelleAction,
  libelleStatut,
  peutAgir,
  resultatTraitement,
  resumeDemande,
  resumeListe,
  type ActionDemande,
  type DemandeAcces,
  type ResultatAffiche,
} from '../lib/demandes-acces'
import { useDemandesAcces, useEstAdmin, useTraiterDemande } from '../lib/profil'

// Les demandes d'accès venues du site, traitées depuis l'app au lieu du lien reçu par mail.
//
// L'écran est réservé à l'administration : la question est posée au serveur (`est_admin()`), pas
// tranchée ici. Le bouton « Valider » ne fait pas d'écriture en base — il appelle l'edge function
// `demande-acces`, exactement le chemin du lien du mail, donc la même invitation, le même mail et
// la même trace. Rien n'est réimplémenté, et rien n'est envoyé par surprise : le bouton dit ce
// qu'il déclenche.
export default function Demandes() {
  const navigate = useNavigate()
  const admin = useEstAdmin()
  const liste = useDemandesAcces(admin.data === true)
  const traiter = useTraiterDemande()
  const [resultat, setResultat] = useState<ResultatAffiche | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)

  const retour = (
    <button className="link" onClick={() => navigate('/compte')} style={{ marginBottom: 8 }}>
      ← Plus
    </button>
  )

  if (admin.isLoading) {
    return (
      <>
        {retour}
        <h1>Demandes d’accès</h1>
        <p className="muted">…</p>
      </>
    )
  }

  if (admin.data !== true) {
    return (
      <>
        {retour}
        <h1>Demandes d’accès</h1>
        <p className="muted">Cet écran est réservé à l’administration de Braaise.</p>
      </>
    )
  }

  const agir = async (action: ActionDemande, d: DemandeAcces) => {
    if (!d.jeton) return
    setResultat(null)
    setEnCours(d.id)
    try {
      const r = await traiter.mutateAsync({ action, jeton: d.jeton })
      const email = r.cas === 'validee' || r.cas === 'refusee' ? r.email : d.email
      setResultat(resultatTraitement(r.cas, email))
    } catch (e) {
      // Le message du serveur s'affiche tel quel : « c'est fait » ne doit jamais être écrit sans
      // que le serveur l'ait dit.
      setResultat({ ton: 'erreur', texte: (e as Error).message })
    } finally {
      setEnCours(null)
    }
  }

  if (liste.isLoading) {
    return (
      <>
        {retour}
        <h1>Demandes d’accès</h1>
        <p className="muted">…</p>
      </>
    )
  }

  if (liste.isError || !liste.data) {
    return (
      <>
        {retour}
        <h1>Demandes d’accès</h1>
        <p className="muted">
          Les demandes n’ont pas pu être lues. Réessaie dans un moment — et si ça persiste, le lien
          du mail reste valable pour les traiter.
        </p>
      </>
    )
  }

  const aTraiter = demandesATraiter(liste.data)
  const traitees = demandesTraitees(liste.data)

  return (
    <>
      {retour}
      <h1>Demandes d’accès</h1>
      <p className="muted">{resumeListe(liste.data)}</p>

      {resultat && (
        <div className="banner">
          <p style={{ margin: 0 }}>{resultat.texte}</p>
        </div>
      )}

      {aTraiter.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Rien à traiter : chaque demande reçue du site a eu sa réponse.
          </p>
        </div>
      )}

      {aTraiter.map((d) => (
        <div className="card" key={d.id}>
          <div className="row">
            <strong>{resumeDemande(d)}</strong>
            <div className="spacer" />
            <span className="badge">{libelleStatut(d.statut)}</span>
          </div>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            {d.email}
            {dateDemande(d.created_at) ? ` · reçue le ${dateDemande(d.created_at)}` : ''}
          </p>
          {d.message && (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>
              « {d.message} »
            </p>
          )}

          {peutAgir(d) ? (
            <>
              <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
                Valider crée l’invitation nominative et envoie le lien d’inscription à cette adresse.
                Refuser n’envoie aucun mail.
              </p>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="primary"
                  disabled={enCours !== null}
                  onClick={() => agir('valider', d)}
                >
                  {enCours === d.id ? 'Envoi…' : libelleAction('valider')}
                </button>
                <button disabled={enCours !== null} onClick={() => agir('refuser', d)}>
                  {libelleAction('refuser')}
                </button>
              </div>
            </>
          ) : (
            <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.85rem' }}>
              Plus rien à décider sur cette ligne.
            </p>
          )}
        </div>
      ))}

      {traitees.length > 0 && (
        <>
          <h2>Déjà traitées</h2>
          <div className="card" style={{ padding: 0 }}>
            {traitees.map((d, i) => (
              <div
                key={d.id}
                className="row"
                style={i > 0 ? { borderTop: '1px solid var(--line)', paddingTop: 8 } : undefined}
              >
                <div>
                  <div>{resumeDemande(d)}</div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {d.email}
                    {dateDemande(d.traitee_at) ? ` · ${dateDemande(d.traitee_at)}` : ''}
                  </div>
                </div>
                <div className="spacer" />
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {libelleStatut(d.statut)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Ce que fait ce bouton est ce que fait le lien reçu par mail : un seul chemin, donc une seule
        invitation possible par demande.
      </p>
    </>
  )
}
