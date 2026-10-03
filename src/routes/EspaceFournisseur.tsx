import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useConfirmerBon, useContesterBon, useEspaceBons, useEspaceBoutique } from '../lib/compte-boutique'
import { phraseDelai } from '../lib/contestation'
import { jour, montant, quantite, statutBon, totalRestant } from '../lib/espace-boutique'

// L'espace de la boutique — écran 3 : les dépôts d'un artisan, un par un.
//
// Chaque bon porte sa date, son numéro, son état (reçu, ou pas encore), ses pièces et sa valeur :
// c'est le papier qu'elle a signé à l'atelier, montré tel qu'il est. Les brouillons n'y sont pas —
// un bon en brouillon n'a jamais quitté l'atelier et n'arrive pas ici (le filtre est dans la base).
//
// Un seul geste est proposé ici, et c'est le plus important : **confirmer la réception**. C'est lui
// qui fait entrer les pièces dans le stock de la boutique — un bon signé mais jamais reçu n'existe
// pas chez elle. Il demande deux clics (la question, puis la réponse) parce qu'il ne se défait pas
// depuis cet écran.
export default function EspaceFournisseur() {
  const { partenaireId } = useParams<{ partenaireId: string }>()
  const { data: etatBrut } = useEspaceBoutique()
  const { data: bons, isLoading, error } = useEspaceBons(partenaireId)

  const fournisseur = etatBrut?.etat?.fournisseurs.find((f) => f.partenaire_id === partenaireId)
  const nom = fournisseur?.artisan || 'Artisan'

  // Deux comptes, pas un : un bon signé à l'atelier mais jamais confirmé n'a pas été REÇU par la
  // boutique (c'est la règle de la 0056). Dire « 3 dépôts reçus » quand l'un attend encore
  // contredirait l'écran précédent, qui porte justement son badge « à confirmer ».
  const total = bons?.length ?? 0
  const recus = (bons ?? []).filter((b) => b.confirme_le).length
  const aConfirmer = total - recus
  const resume = isLoading
    ? 'Chargement…'
    : aConfirmer > 0
      ? `${total} dépôts · ${recus} reçu${recus > 1 ? 's' : ''} · ${aConfirmer} à confirmer`
      : `${recus} dépôt${recus > 1 ? 's' : ''} reçu${recus > 1 ? 's' : ''}`

  return (
    <>
      <p className="muted" style={{ marginTop: 4 }}>
        <Link to="/espace-boutique">‹ Mes fournisseurs</Link>
      </p>
      <h1 style={{ marginTop: 8 }}>{nom}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {resume}
      </p>

      {error && <p className="muted">{(error as Error).message}</p>}
      {!isLoading && !error && (bons?.length ?? 0) === 0 && (
        <p className="empty">Aucun dépôt de cet artisan pour l'instant.</p>
      )}

      {(bons ?? []).map((b) => {
        const st = statutBon(b)
        return (
          <article className="card" key={b.bon_id}>
            <div className="row">
              <strong>{b.numero ? `Bon ${b.numero}` : 'Bon sans numéro'}</strong>
              <div className="spacer" />
              <span className="muted">{jour(b.date)}</span>
            </div>
            <p style={{ margin: '6px 0 10px' }}>
              <span className="badge">{st.texte}</span>
            </p>
            {b.lignes.map((l, i) => (
              <div className="row" key={`${b.bon_id}-${i}`} style={{ padding: '4px 0' }}>
                <span>{l.designation}</span>
                <div className="spacer" />
                <span className="muted">
                  {quantite(l.quantite)} × {montant(l.prix)}
                </span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <strong>{quantite(b.pieces)} pièces</strong>
              <div className="spacer" />
              <strong>{montant(b.valeur)}</strong>
            </div>
            {!st.recu && <ConfirmerBon bonId={b.bon_id} />}
            <SignalerEcart bonId={b.bon_id} dateDepot={b.date} />

          </article>
        )
      })}

      {fournisseur && (
        <Link
          to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}/declarer`}
          className="card"
          style={{ display: 'block' }}
        >
          <div className="row">
            <strong>Déclarer mes ventes à {nom}</strong>
            <div className="spacer" />
            <span className="muted">›</span>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Ce que tu as vendu depuis la dernière fois, en un seul envoi.
          </p>
        </Link>
      )}

      {fournisseur && (
        <Link
          to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}/historique`}
          className="card"
          style={{ display: 'block' }}
        >
          <div className="row">
            <strong>Mes ventes déclarées à {nom}</strong>
            <div className="spacer" />
            <span className="muted">›</span>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Mois par mois, ce que tu as déclaré et ce que l'artisan en a fait.
          </p>
        </Link>
      )}

      {fournisseur && (
        <Link
          to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}/reste`}
          className="card"
          style={{ display: 'block' }}
        >
          <div className="row">
            <strong>Ce qui te reste chez {nom}</strong>
            <div className="spacer" />
            <strong>{quantite(totalRestant(fournisseur.pieces))} pièces</strong>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Pièce par pièce, ce qui n'est pas encore vendu. ›
          </p>
        </Link>
      )}
    </>
  )
}

/**
 * Signaler un écart : « ce bon ne correspond pas ». Possible à tout moment, avant ou après la
 * confirmation — la boutique compte parfois après avoir confirmé. La phrase du délai (3 jours après
 * le dépôt) se lit AVANT d'écrire ; passé ce délai le signalement part quand même, marqué « tardif »
 * chez l'artisan. Le bon, lui, ne change pas : le message est une trace.
 */
function SignalerEcart({ bonId, dateDepot }: { bonId: string; dateDepot: string | null }) {
  const [ouvert, setOuvert] = useState(false)
  const [message, setMessage] = useState('')
  const contester = useContesterBon()

  if (contester.isSuccess) {
    return (
      <p className="muted" style={{ margin: '10px 0 0' }} role="status">
        Signalement envoyé à l'artisan. Le bon n'a pas changé : c'est lui qui tranche.
      </p>
    )
  }

  if (!ouvert) {
    return (
      <div className="row" style={{ marginTop: 6 }}>
        <div className="spacer" />
        <button className="link" type="button" onClick={() => setOuvert(true)}>
          Signaler un écart
        </button>
      </div>
    )
  }

  return (
    <form
      style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}
      onSubmit={(e) => {
        e.preventDefault()
        contester.mutate({ bonId, message: message.trim() })
      }}
    >
      <p className="muted" style={{ margin: '0 0 8px' }}>
        {phraseDelai(dateDepot)}
      </p>
      <label>
        Ce qui ne correspond pas
        <textarea
          rows={3}
          maxLength={2000}
          required
          minLength={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex. il manque une pièce, ou il y en a une qui n'est pas sur le bon"
        />
      </label>
      {contester.isError && (
        <p className="muted" style={{ margin: '8px 0 0' }}>
          {(contester.error as Error).message}
        </p>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <div className="spacer" />
        <button className="link" type="button" disabled={contester.isPending} onClick={() => setOuvert(false)}>
          Annuler
        </button>
        <button className="primary" type="submit" disabled={contester.isPending || message.trim().length < 3}>
          {contester.isPending ? 'Envoi…' : 'Envoyer à l’artisan'}
        </button>
      </div>
    </form>
  )
}

/**
 * Confirmer la réception d'un bon — deux clics, jamais un.
 *
 * Le premier demande, le second fait : un seul clic sur un geste qui range des pièces dans le stock
 * (et qui notifie l'artisan) se déclenche trop souvent par erreur, sur un téléphone qui défile. Le
 * refus de la base s'affiche tel quel — un geste qui n'est pas passé doit se voir.
 */
function ConfirmerBon({ bonId }: { bonId: string }) {
  const [demande, setDemande] = useState(false)
  const confirmer = useConfirmerBon()

  if (!demande) {
    return (
      <div className="row" style={{ marginTop: 10 }}>
        <div className="spacer" />
        <button className="primary" type="button" onClick={() => setDemande(true)}>
          Confirmer ce bon
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <p style={{ margin: '0 0 8px' }}>
        Confirmer que ces pièces sont bien arrivées ? Elles entreront dans ton stock, et l'artisan
        est prévenu.
      </p>
      {confirmer.isError && (
        <p className="muted" style={{ margin: '0 0 8px' }}>
          {(confirmer.error as Error).message}
        </p>
      )}
      <div className="row">
        <div className="spacer" />
        <button
          className="link"
          type="button"
          disabled={confirmer.isPending}
          onClick={() => setDemande(false)}
        >
          Annuler
        </button>
        <button
          className="primary"
          type="button"
          disabled={confirmer.isPending}
          onClick={() => confirmer.mutate(bonId)}
        >
          {confirmer.isPending ? 'Envoi…' : "Oui, j'ai reçu"}
        </button>
      </div>
    </div>
  )
}
