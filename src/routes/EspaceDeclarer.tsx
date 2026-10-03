import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDeclarerVentes, useEspaceBoutique } from '../lib/compte-boutique'
import { depassements, lignesADeclarer, montant, quantite, totalDeclare, ventesEnvoyees } from '../lib/espace-boutique'
import { Pas } from './EspaceFournisseurReste'

// L'espace de la boutique — déclarer ses ventes à un artisan.
//
// UN envoi : toutes les pièces vendues depuis la dernière fois, d'un coup. La base en fait une ligne
// datée qui S'AJOUTE (rien n'est écrasé) ; envoyer deux fois compte donc deux fois. D'où trois
// garde-fous : deux clics (récapitulatif, puis envoi), un bouton qui se verrouille pendant l'envoi,
// et un écran qui ne propose plus rien une fois l'envoi accepté.
//
// Un dépassement (plus de pièces déclarées qu'il n'en reste) n'est pas refusé : la base le signale à
// l'artisan, qui tranche. L'écran le dit AVANT l'envoi, pour que la boutique recompte si c'est une faute.
// Seules les ventes se déclarent ici ; l'artisan valide ensuite dans Braaise et garde la main.
export default function EspaceDeclarer() {
  const { partenaireId } = useParams<{ partenaireId: string }>()
  const { data, isLoading, error } = useEspaceBoutique()
  const [saisie, setSaisie] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [recap, setRecap] = useState(false)
  const declarer = useDeclarerVentes()

  if (isLoading) return <p className="muted">Chargement…</p>
  if (error) return <p className="muted">{(error as Error).message}</p>
  if (data?.erreur) return <p className="empty">{data.erreur}</p>

  const fournisseur = data?.etat?.fournisseurs.find((f) => f.partenaire_id === partenaireId)
  if (!fournisseur) return <p className="empty">Cet artisan n'est plus rattaché à ta boutique.</p>

  const nom = fournisseur.artisan || 'Artisan'
  const retour = (
    <p className="muted" style={{ marginTop: 4 }}>
      <Link to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}`}>‹ {nom}</Link>
    </p>
  )

  // Après un envoi accepté, plus rien à saisir : un second envoi compterait les ventes deux fois.
  if (declarer.isSuccess) {
    const { facturable, alerte } = declarer.data
    return (
      <>
        {retour}
        <h1 style={{ marginTop: 8 }}>Ventes envoyées</h1>
        <div className="card" role="status">
          <p style={{ margin: 0 }}>
            C'est parti chez {nom} : <strong>{montant(facturable)}</strong> à lui régler pour cet envoi. Il le vérifie et le valide.
          </p>
          {alerte && (
            <p style={{ margin: '10px 0 0' }}>
              <span className="badge">Écart signalé</span> Tu as déclaré plus de pièces qu'il n'en restait d'après les bons : l'artisan
              tranchera.
            </p>
          )}
        </div>
        <Link
          to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}/historique`}
          className="card"
          style={{ display: 'block' }}
        >
          <div className="row">
            <strong>Voir mes ventes déclarées</strong>
            <div className="spacer" />
            <span className="muted">›</span>
          </div>
        </Link>
      </>
    )
  }

  const lignes = lignesADeclarer(fournisseur.pieces).map((l) => ({ ...l, ventes: saisie[l.cle] ?? 0 }))
  const total = totalDeclare(lignes)
  const trop = depassements(lignes)
  const envoyees = ventesEnvoyees(lignes)

  return (
    <>
      {retour}
      <h1 style={{ marginTop: 8 }}>Déclarer mes ventes</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Pour chaque pièce, combien en as-tu vendu depuis ta dernière déclaration à {nom} ?
      </p>

      {lignes.length === 0 && <p className="empty">Rien à déclarer : aucune pièce en stock chez toi pour cet artisan.</p>}

      {!recap &&
        lignes.map((l) => (
          <div className="row card" key={l.cle} style={{ alignItems: 'center' }}>
            <div>
              <strong>{l.designation}</strong>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.9rem' }}>
                {quantite(l.reste)} en stock · {montant(l.prix)} la pièce
              </p>
            </div>
            <div className="spacer" />
            <Pas nom={`Pièces vendues : ${l.designation}`} valeur={l.ventes} onChange={(v) => setSaisie((s) => ({ ...s, [l.cle]: v }))} />
          </div>
        ))}

      {!recap && lignes.length > 0 && (
        <>
          <input
            style={{ width: '100%', marginTop: 10, fontSize: 16 }}
            placeholder="Un mot pour l'artisan (facultatif)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <strong>
              {quantite(total.pieces)} pièce{total.pieces > 1 ? 's' : ''} · {montant(total.montant)}
            </strong>
            <div className="spacer" />
            <button className="primary" type="button" disabled={envoyees.length === 0} onClick={() => setRecap(true)}>
              Vérifier
            </button>
          </div>
        </>
      )}

      {recap && (
        <section className="card">
          <strong>Vérifie avant d'envoyer</strong>
          {lignes
            .filter((l) => l.ventes > 0)
            .map((l) => (
              <div className="row" key={l.cle} style={{ padding: '4px 0' }}>
                <span>{l.designation}</span>
                <div className="spacer" />
                <span className="muted">
                  {quantite(l.ventes)} × {montant(l.prix)}
                </span>
              </div>
            ))}
          <div className="row" style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <strong>{quantite(total.pieces)} pièces</strong>
            <div className="spacer" />
            <strong>{montant(total.montant)}</strong>
          </div>
          {trop.length > 0 && (
            <p style={{ margin: '10px 0 0' }}>
              <span className="badge">Attention</span> Pour {trop.map((l) => l.designation).join(', ')}, tu déclares plus de pièces qu'il n'en
              reste. L'artisan sera prévenu d'un écart : recompte si c'est une erreur.
            </p>
          )}
          <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.9rem' }}>
            L'envoi s'ajoute à tes déclarations : ne l'envoie qu'une fois.
          </p>
          {declarer.isError && (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              {(declarer.error as Error).message}
            </p>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="link" type="button" disabled={declarer.isPending} onClick={() => setRecap(false)}>
              Modifier
            </button>
            <div className="spacer" />
            <button
              className="primary"
              type="button"
              disabled={declarer.isPending}
              onClick={() => declarer.mutate({ partenaireId: fournisseur.partenaire_id, ventes: envoyees, note })}
            >
              {declarer.isPending ? 'Envoi…' : 'Envoyer à ' + nom}
            </button>
          </div>
        </section>
      )}
    </>
  )
}
