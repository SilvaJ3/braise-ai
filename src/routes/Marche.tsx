import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Skeleton from '../components/Skeleton'
import {
  useAjouterLigneLibre,
  useAjusterLigne,
  useClonturerMarche,
  useMarche,
  useNoteLigne,
  useVendreProduit,
} from '../lib/marches'
import { useProduits } from '../lib/produits'

export default function Marche() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useMarche(id)
  const { data: produits = [] } = useProduits()
  const vendre = useVendreProduit()
  const ajuster = useAjusterLigne()
  const noter = useNoteLigne()
  const ajouterLigneLibre = useAjouterLigneLibre()
  const cloturer = useClonturerMarche()
  const [libre, setLibre] = useState('')

  if (isLoading) return <Skeleton rows={5} />
  if (!data) return <p className="empty">Marché introuvable.</p>

  const { marche, lignes } = data
  const fermee = marche.statut === 'cloture'
  const total = lignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0)
  const totalArticles = lignes.reduce((s, l) => s + Number(l.quantite), 0)

  function vendreProduit(produitId: string) {
    const p = produits.find((x) => x.id === produitId)
    if (!p) return
    const existante = lignes.find((l) => l.produit_id === p.id)
    vendre.mutate({ marcheId: marche.id, produit: p, existante })
  }

  function ajouterArticleLibre() {
    if (!libre.trim()) return
    ajouterLigneLibre.mutate(
      { marcheId: marche.id, designation: libre, position: lignes.length },
      { onSuccess: () => setLibre('') },
    )
  }

  return (
    <>
      <button className="link" onClick={() => navigate('/boutiques?tab=marches')} style={{ marginBottom: 8 }}>
        ← Retour
      </button>

      <div className="row">
        <h1 style={{ margin: 0 }}>{marche.nom}</h1>
        <div className="spacer" />
        <span className="badge">{fermee ? 'Clôturé' : 'Ouvert'}</span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {marche.lieu} · {new Date(marche.date_marche + 'T00:00:00').toLocaleDateString('fr-BE')}
      </p>

      <h2>Ventes</h2>
      <div className="card">
        {lignes.length === 0 && (
          <p className="empty" style={{ margin: '0 0 10px' }}>
            Appuie sur + à chaque vente d'un produit.
          </p>
        )}

        {lignes.map((l) => (
          <div className="depot-item" key={l.id}>
            <div className="row">
              <strong>{l.designation}</strong>
              <div className="spacer" />
              <span className="muted">{(Number(l.quantite) * Number(l.prix_unitaire)).toFixed(2)} €</span>
            </div>
            <div className="row depot-item-detail">
              {!fermee && (
                <button type="button" aria-label={`Retirer une vente de ${l.designation}`} onClick={() => ajuster.mutate({ ligne: l, delta: -1 })}>
                  −
                </button>
              )}
              <strong style={{ minWidth: 32, textAlign: 'center' }}>{l.quantite}</strong>
              {!fermee && (
                <button type="button" aria-label={`Ajouter une vente de ${l.designation}`} onClick={() => ajuster.mutate({ ligne: l, delta: 1 })}>
                  +
                </button>
              )}
              <div className="spacer" />
              {!fermee && (
                <input
                  aria-label={`Note pour ${l.designation}`}
                  placeholder="note (optionnel)"
                  defaultValue={l.note ?? ''}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (l.note ?? '')) {
                      noter.mutate({ id: l.id, marcheId: marche.id, note: e.target.value })
                    }
                  }}
                  style={{ minHeight: 32, padding: '4px 8px', maxWidth: 160 }}
                />
              )}
            </div>
            {fermee && l.note && (
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {l.note}
              </p>
            )}
          </div>
        ))}

        {!fermee && (
          <>
            <select
              aria-label="Vendre un produit"
              value=""
              onChange={(e) => {
                if (e.target.value) vendreProduit(e.target.value)
                e.target.value = ''
              }}
              style={{ marginTop: lignes.length ? 10 : 0 }}
            >
              <option value="">+ Vendre un produit…</option>
              {produits
                .filter((p) => p.actif)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                    {p.senteur ? ` · ${p.senteur}` : ''}
                  </option>
                ))}
            </select>

            <div className="row" style={{ marginTop: 8 }}>
              <input
                placeholder="Article hors catalogue…"
                value={libre}
                onChange={(e) => setLibre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && ajouterArticleLibre()}
              />
              <button type="button" onClick={ajouterArticleLibre} disabled={!libre.trim()}>
                Ajouter
              </button>
            </div>
          </>
        )}

        {lignes.length > 0 && (
          <div className="depot-total">
            <span>{totalArticles} article{totalArticles > 1 ? 's' : ''} vendu{totalArticles > 1 ? 's' : ''}</span>
            <span>{total.toFixed(2)} €</span>
          </div>
        )}
      </div>

      <div className="row" style={{ marginTop: 12, marginBottom: 24 }}>
        <button
          className={fermee ? '' : 'primary'}
          disabled={cloturer.isPending}
          onClick={() => cloturer.mutate({ id: marche.id, cloturer: !fermee })}
        >
          {fermee ? 'Rouvrir le marché' : 'Clôturer le marché'}
        </button>
      </div>
    </>
  )
}
