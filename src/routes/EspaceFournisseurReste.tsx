import { useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCommanderReassort, useEspaceBoutique } from '../lib/compte-boutique'
import {
  lignesDemandees,
  montant,
  propositionsReassort,
  quantite,
  totalDemande,
  totalRestant,
  type LigneReassort,
  type PieceEspace,
} from '../lib/espace-boutique'

// L'espace de la boutique — écran 4 : ce qui reste chez elle, pour cet artisan.
//
// Le restant ne se saisit pas : il se calcule (déposé + entrées − vendues − reprises), et il ne
// compte que les bons que la boutique a confirmés. Une ligne « reprise » est une pièce que
// l'artisan a récupérée : elle n'est pas facturée, elle sort du stock — c'est pour ça qu'elle est
// montrée à part des ventes.
//
// En bas, le second geste : **demander un réassort**. Les quantités proposées sont celles du dernier
// dépôt de chaque pièce (la base les rend : `derniere_quantite`), parce qu'un chiffre juste se
// corrige d'un cran alors qu'un chiffre inventé se corrige de zéro. La demande part chez l'artisan
// comme une commande ordinaire, à ses statuts — et il est prévenu.
export default function EspaceFournisseurReste() {
  const { partenaireId } = useParams<{ partenaireId: string }>()
  const { data, isLoading, error } = useEspaceBoutique()

  if (isLoading) return <p className="muted">Chargement…</p>
  if (error) return <p className="muted">{(error as Error).message}</p>
  if (data?.erreur) return <p className="empty">{data.erreur}</p>

  const fournisseur = data?.etat?.fournisseurs.find((f) => f.partenaire_id === partenaireId)
  if (!fournisseur) return <p className="empty">Cet artisan n'est plus rattaché à ta boutique.</p>

  const nom = fournisseur.artisan || 'Artisan'
  const total = totalRestant(fournisseur.pieces)

  return (
    <>
      <p className="muted" style={{ marginTop: 4 }}>
        <Link to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}`}>‹ Ses dépôts</Link>
      </p>
      <h1 style={{ marginTop: 8 }}>Chez {nom} : ce qui te reste</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {quantite(total)} pièce{total > 1 ? 's' : ''} encore chez toi
      </p>

      {fournisseur.pieces.length === 0 && (
        <p className="empty">Rien en stock pour l'instant : aucun bon confirmé avec cet artisan.</p>
      )}

      {fournisseur.pieces.map((p) => (
        <article className="card" key={p.cle || p.designation}>
          <div className="row">
            <strong>{p.designation}</strong>
            <div className="spacer" />
            <strong>{quantite(p.reste)}</strong>
          </div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
            déposé {quantite(p.depose)}
            {p.entre !== 0 ? ` · entré ${quantite(p.entre)}` : ''}
            {p.vendu !== 0 ? ` · vendu ${quantite(p.vendu)}` : ''}
            {p.repris !== 0 ? ` · repris ${quantite(p.repris)}` : ''}
            {p.prix ? ` · ${montant(p.prix)} la pièce` : ''}
          </p>
        </article>
      ))}

      {fournisseur.pieces.length > 0 && (
        <div className="row" style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <strong>Total restant</strong>
          <div className="spacer" />
          <strong>
            {quantite(total)} · {montant(fournisseur.pieces.reduce((s, p) => s + p.reste * p.prix, 0))}
          </strong>
        </div>
      )}

      <p className="muted" style={{ marginTop: 16, fontSize: '0.85rem' }}>
        Le restant se calcule à partir des bons confirmés : ce qui a été déposé, plus les entrées
        sans bon, moins les ventes et les reprises.
      </p>

      <Reassort partenaireId={fournisseur.partenaire_id} pieces={fournisseur.pieces} />
    </>
  )
}

/**
 * Demander un réassort — le second geste de l'espace, et le seul qui parte de son initiative.
 *
 * Ce qui part à la base : une clé de pièce et une quantité, jamais un libellé saisi (`boutique_
 * commander` résout la clé : un produit du catalogue, ou un libellé déjà déposé). Les propositions
 * viennent du dernier dépôt ; une quantité mise à zéro sort de la demande au lieu d'envoyer une
 * ligne vide.
 */
function Reassort({ partenaireId, pieces }: { partenaireId: string; pieces: PieceEspace[] }) {
  const [ouvert, setOuvert] = useState(false)
  const [lignes, setLignes] = useState<LigneReassort[]>([])
  const [note, setNote] = useState('')
  const [envoye, setEnvoye] = useState(false)
  const commander = useCommanderReassort()

  const proposables = propositionsReassort(pieces)
  const demande = lignesDemandees(lignes)
  const total = totalDemande(lignes)

  function ouvrir() {
    setLignes(proposables)
    setNote('')
    setEnvoye(false)
    commander.reset()
    setOuvert(true)
  }

  if (!ouvert) {
    return (
      <div style={{ marginTop: 20 }}>
        {envoye && (
          <p className="muted" style={{ margin: '0 0 8px' }}>
            Ta demande est partie chez l'artisan : il la recevra comme une commande et la confirmera.
          </p>
        )}
        <p className="muted" style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>
          Les quantités sont déjà remplies avec ce que tu as reçu au dernier dépôt.
        </p>
        <button className="primary" type="button" onClick={ouvrir}>
          Demander un réassort
        </button>
      </div>
    )
  }

  return (
    <section className="card" style={{ marginTop: 20 }}>
      <strong>Demander un réassort</strong>

      {proposables.length === 0 && (
        <p className="empty" style={{ marginTop: 8 }}>
          Rien à redemander pour l'instant : aucun dépôt de cet artisan n'est enregistré.
        </p>
      )}

      {lignes.map((l, i) => (
        <div className="row" key={l.cle} style={{ padding: '6px 0' }}>
          <span>{l.designation}</span>
          <div className="spacer" />
          <Pas
            valeur={l.quantite}
            onChange={(v) => setLignes((ls) => ls.map((x, j) => (j === i ? { ...x, quantite: v } : x)))}
          />
        </div>
      ))}

      {lignes.length > 0 && (
        <>
          <input
            style={{ width: '100%', marginTop: 10, fontSize: 16 }}
            placeholder="Un mot pour l'artisan (facultatif)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="row" style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <strong>
              {quantite(total)} pièce{total > 1 ? 's' : ''} demandée{total > 1 ? 's' : ''}
            </strong>
          </div>
        </>
      )}

      {commander.isError && (
        <p className="muted" style={{ margin: '8px 0 0' }}>
          {(commander.error as Error).message}
        </p>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="link" type="button" disabled={commander.isPending} onClick={() => setOuvert(false)}>
          Annuler
        </button>
        <div className="spacer" />
        <button
          className="primary"
          type="button"
          disabled={commander.isPending || demande.length === 0}
          onClick={() =>
            commander.mutate(
              { partenaireId, lignes: demande, note },
              {
                onSuccess: () => {
                  setOuvert(false)
                  setEnvoye(true)
                },
              },
            )
          }
        >
          {commander.isPending ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </div>
    </section>
  )
}

/**
 * Un pas-à-pas − / + autour du chiffre : deux pastilles rondes de 36 px et un champ de 56 px entre
 * elles, qui **reste saisissable au clavier** — compter quinze pièces à coups de « + » serait une
 * punition. Le champ est à 16 px : en dessous, iOS zoome tout seul au focus.
 */
function Pas({ valeur, onChange }: { valeur: number; onChange: (v: number) => void }) {
  const bouton: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 18,
    padding: 0,
    lineHeight: 1,
    fontSize: 18,
  }
  return (
    <div className="row" style={{ gap: 8, flex: '0 0 auto' }}>
      <button
        type="button"
        style={bouton}
        aria-label="Une pièce de moins"
        onClick={() => onChange(Math.max(valeur - 1, 0))}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={valeur}
        aria-label="Quantité demandée"
        style={{ width: 56, textAlign: 'center', fontSize: 16 }}
        onChange={(e) => {
          const v = Number(e.target.value)
          onChange(Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
        }}
      />
      <button
        type="button"
        style={bouton}
        aria-label="Une pièce de plus"
        onClick={() => onChange(valeur + 1)}
      >
        +
      </button>
    </div>
  )
}
