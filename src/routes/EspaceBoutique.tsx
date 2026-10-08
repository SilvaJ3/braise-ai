import { useState } from 'react'
import { Link } from 'react-router-dom'
import { etatAbonnementBoutique } from '../lib/abonnement-boutique'
import { useEspaceBons, useEspaceBoutique, useMonAbonnementBoutique } from '../lib/compte-boutique'
import { resumeFournisseur, type EtatEspace, type FournisseurEspace } from '../lib/espace-boutique'
import { planningDeLaSemaine } from '../lib/planning-boutique'
import { supabase } from '../lib/supabase'

// L'espace de la boutique connectée — l'écran d'entrée : cette semaine, puis ses fournisseurs.
//
// C'est la première chose qu'elle voit après avoir choisi son mot de passe. Elle ne voit QUE ses
// artisans rattachés : ni les autres boutiques d'un artisan, ni son stock personnel (le cloisonnement
// est dans la base, pas ici). Aucun geste d'écriture n'est proposé depuis cet écran — la démonstration
// du 26/09 s'arrête à ce qu'elle voit.
export default function EspaceBoutique() {
  const { data, isLoading, error } = useEspaceBoutique()

  if (isLoading) return <p className="muted">Chargement…</p>
  if (error) return <p className="muted">{(error as Error).message}</p>
  if (!data) return <p className="empty">Rien à afficher.</p>
  if (data.erreur) return <p className="empty">{data.erreur}</p>

  const etat = data.etat
  if (!etat) return <p className="empty">Rien à afficher.</p>

  return (
    <>
      <header className="row" style={{ marginTop: 4 }}>
        <div>
          <h1 style={{ marginBottom: 0 }}>{etat.nom || 'Ma boutique'}</h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            {etat.fournisseurs.length === 1
              ? '1 artisan qui dépose chez toi'
              : `${etat.fournisseurs.length} artisans qui déposent chez toi`}
          </p>
        </div>
        <div className="spacer" />
        <Deconnexion />
      </header>

      <Planning etat={etat} />

      {etat.fournisseurs.length === 0 && (
        <p className="empty">Aucun artisan n'est encore rattaché à ta boutique.</p>
      )}

      {etat.fournisseurs.map((f) => (
        <CarteFournisseur key={f.partenaire_id} fournisseur={f} />
      ))}

      <LienAbonnement />

      <p className="muted" style={{ marginTop: 20, fontSize: '0.85rem' }}>
        Dépôt-vente — les pièces restent la propriété de l'artisan tant qu'elles ne sont pas vendues.
      </p>
    </>
  )
}

/**
 * Un fournisseur, en un bloc : son nom, ce qui est arrivé, ce qui reste. Le compte des dépôts n'est
 * pas dans `boutique_etat` (qui n'agrège que des pièces) : il vient de ses bons, une requête par
 * artisan — c'est justement ce que montre la liste, et il y en a peu.
 */
function CarteFournisseur({ fournisseur }: { fournisseur: FournisseurEspace }) {
  const { data: bons, isLoading } = useEspaceBons(fournisseur.partenaire_id)
  const resume = isLoading ? '…' : resumeFournisseur(bons ?? [], fournisseur.pieces)

  return (
    <Link to={`/espace-boutique/fournisseur/${fournisseur.partenaire_id}`} className="card" style={{ display: 'block' }}>
      <div className="row">
        <strong>{fournisseur.artisan || 'Artisan'}</strong>
        <div className="spacer" />
        <span className="muted">›</span>
      </div>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        {resume}
      </p>
      {fournisseur.a_confirmer.length > 0 && (
        <p style={{ margin: '6px 0 0' }}>
          <span className="badge">
            {fournisseur.a_confirmer.length === 1
              ? '1 bon à confirmer'
              : `${fournisseur.a_confirmer.length} bons à confirmer`}
          </span>
        </p>
      )}
    </Link>
  )
}

/**
 * Le chemin vers « Mon abonnement » — seulement quand il y a quelque chose à y voir. Une boutique
 * sans abonnement ni accès offert (ou une base où la fonction n'existe pas encore) ne voit rien :
 * on n'annonce pas un écran vide.
 */
function LienAbonnement() {
  const { data } = useMonAbonnementBoutique()
  if (!data) return null
  const etat = etatAbonnementBoutique(data)
  if (etat.statut === 'aucun') return null
  return (
    <Link to="/espace-boutique/abonnement" className="card" style={{ display: 'block' }}>
      <div className="row">
        <strong>Mon abonnement</strong>
        <span className="badge">{etat.badge}</span>
        <div className="spacer" />
        <span className="muted">›</span>
      </div>
    </Link>
  )
}

/**
 * « Cette semaine » — le planning en trois lignes au plus, calculé à partir de ce que la base sait
 * déjà (bons à confirmer, rituel du mois, fins de rayon, rythme de chaque artisan). L'idée : elle
 * n'a plus besoin d'un carnet pour savoir ce qui l'attend — le carnet ne relance personne.
 */
function Planning({ etat }: { etat: EtatEspace }) {
  const lignes = planningDeLaSemaine(etat).slice(0, 3)
  return (
    <section className="card" style={{ marginTop: 12 }}>
      <strong>Cette semaine</strong>
      {lignes.length === 0 ? (
        <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
          Rien en attente : tout est à jour.
        </p>
      ) : (
        lignes.map((l) => (
          <p key={l.cle} style={{ margin: '8px 0 0' }}>
            <Link to={l.vers} className="link">
              <span aria-hidden="true" style={{ marginRight: 6 }}>
                {l.icone}
              </span>
              {l.texte}
            </Link>
          </p>
        ))
      )}
    </section>
  )
}

/** Se déconnecter doit rester possible depuis le téléphone, sans passer par un écran d'artisan. */
function Deconnexion() {
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="link"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void supabase.auth.signOut()
      }}
    >
      Quitter
    </button>
  )
}
