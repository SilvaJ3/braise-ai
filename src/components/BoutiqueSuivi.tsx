import { useState } from 'react'
import {
  STATUT_RELEVE_EXPLICATION,
  STATUT_RELEVE_LABEL,
  TEXTE_ECART,
  estNouveau,
  jourDeIso,
  lienBoutiqueUrl,
  periodeLisible,
  resumeReleve,
  totalRestant,
  type BoutiqueEtat,
} from '../lib/boutique-etat'
import {
  useCorrigerDeclaration,
  useCouperLienBoutique,
  useMarquerContestationVue,
  useMesBoutiquesEtat,
} from '../lib/boutiques'
import { fmtDateCourte, fmtEuro, fmtQte } from '../lib/depots'
import type { Boutique } from '../lib/supabase'
import Skeleton from './Skeleton'

/**
 * Ce que l'artisane voit de sa boutique quand elle la regarde — le stock chez elle pièce par
 * pièce, ce qu'elle a signalé, ses relevés à valider ou à écarter, et son lien.
 *
 * Tout vient d'un seul appel (`mes_boutiques_etat`), filtré côté base par `auth.uid()` : cet écran
 * ne demande jamais « la boutique de qui ? », et il ne peut pas montrer celle d'un autre.
 *
 * Le vocabulaire suit la page de la boutique : on dit « chez elle », « son relevé », « ce qu'elle
 * a signalé » — pas « l'enregistrement », pas « l'entité ».
 */
export default function BoutiqueSuivi({ boutique }: { boutique: Boutique }) {
  const { data: etats = [], isLoading, error } = useMesBoutiquesEtat()
  const etat = etats.find((e) => e.id === boutique.id)

  if (isLoading) return <Skeleton rows={3} />
  if (error) return <p className="muted">Erreur : {(error as Error).message}</p>
  // Boutique inactive : `mes_boutiques_etat` ne rend que les actives. Le reste de la fiche
  // (coordonnées, bons, commandes) continue de s'afficher — il n'y a simplement rien à suivre.
  if (!etat) return null

  return (
    <>
      <Stock boutique={boutique} etat={etat} />
      <Signale etat={etat} />
      <Releves etat={etat} />
      <Lien boutique={boutique} etat={etat} />
    </>
  )
}

/** Le stock chez la boutique : ce qui reste, pièce par pièce. Il se calcule, il ne se saisit pas. */
function Stock({ boutique, etat }: { boutique: Boutique; etat: BoutiqueEtat }) {
  const reste = totalRestant(etat.pieces)

  return (
    <>
      <h2>Chez {boutique.nom}</h2>

      {etat.bons_en_attente_de_confirmation > 0 && (
        <div className="banner">
          {etat.bons_en_attente_de_confirmation} bon
          {etat.bons_en_attente_de_confirmation > 1 ? 's' : ''} attend
          {etat.bons_en_attente_de_confirmation > 1 ? 'ent' : ''} sa confirmation. Tant qu'elle ne
          les a pas confirmés, ces pièces ne comptent pas dans son stock : c'est la réception qui
          fait foi, pas l'envoi.
        </div>
      )}

      {etat.pieces.length === 0 ? (
        <p className="empty">
          Aucune pièce confirmée chez elle pour l'instant. Le stock part du bon qu'elle confirme.
        </p>
      ) : (
        <>
          <div className="card">
            {etat.pieces.map((p) => (
              <div key={p.cle} style={{ marginBottom: 12 }}>
                <div className="row">
                  <strong>{p.designation}</strong>
                  <span className="muted">{fmtEuro(p.prix)} pièce</span>
                  <span className="spacer" />
                  <span className="badge">
                    {fmtQte(p.reste)} restant{p.reste > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="muted" style={{ margin: '2px 0 0' }}>
                  Déposé {fmtQte(p.depose)}
                  {p.entre > 0 && ` · reçu sans bon ${fmtQte(p.entre)}`}
                  {p.vendu > 0 && ` · vendu ${fmtQte(p.vendu)}`}
                  {p.repris > 0 && ` · repris ${fmtQte(p.repris)}`}
                </p>
              </div>
            ))}
          </div>
          <p className="muted">
            {fmtQte(reste)} pièce{reste > 1 ? 's' : ''} chez elle, toutes références confondues.
            Déposé + reçu − vendu − repris : le restant se calcule, il ne se saisit jamais.
          </p>
        </>
      )}
    </>
  )
}

/** « Ce bon ne correspond pas » : son message, le bon qu'il vise, et rien de modifié. */
function Signale({ etat }: { etat: BoutiqueEtat }) {
  const marquerVu = useMarquerContestationVue()

  if (etat.contestations.length === 0) return null

  return (
    <>
      <h2>Ce qu'elle a signalé</h2>
      {etat.contestations.map((c) => (
        <div className="card" key={c.id}>
          <div className="row">
            <strong>{c.numero ? `Bon n° ${c.numero}` : 'Un bon'}</strong>
            <span className="muted">· déposé le {fmtDateCourte(c.date_depot ?? '')}</span>
            <span className="spacer" />
            {estNouveau(c) && <span className="badge">nouveau</span>}
          </div>
          <p style={{ margin: '8px 0 4px' }}>« {c.message} »</p>
          <p className="muted" style={{ margin: 0 }}>
            Reçu le {jourDeIso(c.cree_le)}. Le bon n'a pas été modifié — c'est à toi de trancher :
            un nouveau bon, une reprise, ou une correction de stock.
          </p>
          {estNouveau(c) ? (
            <div className="row" style={{ marginTop: 8 }}>
              <div className="spacer" />
              <button
                className="link"
                disabled={marquerVu.isPending}
                onClick={() => marquerVu.mutate(c.id)}
              >
                Marquer comme vu
              </button>
            </div>
          ) : (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Vu le {jourDeIso(c.vu_le)}.
            </p>
          )}
        </div>
      ))}
    </>
  )
}

/** Les relevés qu'elle a envoyés : le montant qui en sort, et les deux issues — valider, écarter. */
function Releves({ etat }: { etat: BoutiqueEtat }) {
  const corriger = useCorrigerDeclaration()
  const [enCorrection, setEnCorrection] = useState<string | null>(null)
  const [raison, setRaison] = useState('')

  return (
    <>
      <h2>Relevés reçus</h2>

      {etat.declarations.length === 0 && (
        <p className="empty">
          Aucun relevé pour l'instant. Elle les envoie depuis son lien, en comptant ce qu'il lui
          reste.
        </p>
      )}

      {corriger.isError && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {(corriger.error as Error).message}
        </p>
      )}

      {etat.declarations.map((r) => (
        <div className="card" key={r.id}>
          <div className="row">
            <strong>{periodeLisible(r.periode)}</strong>
            {r.alerte && <span className="badge">écart signalé</span>}
            <span className="spacer" />
            <span className="badge">{STATUT_RELEVE_LABEL[r.statut]}</span>
          </div>

          <p style={{ margin: '8px 0 2px' }}>{resumeReleve(r)}</p>
          <p style={{ margin: 0 }}>
            <strong>{fmtEuro(r.facturable)}</strong> à facturer
            {r.reprises > 0 && (
              <span className="muted"> — les reprises n'entrent pas dans ce montant</span>
            )}
          </p>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Reçu le {jourDeIso(r.declare_le)}. {STATUT_RELEVE_EXPLICATION[r.statut]}
          </p>
          {r.alerte && (
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {TEXTE_ECART}
            </p>
          )}
          {r.note && (
            <p className="muted" style={{ margin: '6px 0 0' }}>
              Son mot : « {r.note} »
            </p>
          )}

          {enCorrection === r.id ? (
            <div style={{ marginTop: 10 }}>
              <label htmlFor={`raison-${r.id}`}>Pourquoi tu écartes ce relevé</label>
              <textarea
                id={`raison-${r.id}`}
                value={raison}
                onChange={(e) => setRaison(e.target.value)}
                placeholder="Par exemple : ces deux ventes ont été comptées deux fois."
              />
              <div className="row">
                <button
                  disabled={corriger.isPending}
                  onClick={() =>
                    corriger.mutate(
                      { id: r.id, statut: 'corrigee', note: raison },
                      {
                        onSuccess: () => {
                          setEnCorrection(null)
                          setRaison('')
                        },
                      },
                    )
                  }
                >
                  Écarter ce relevé
                </button>
                <button
                  className="link"
                  onClick={() => {
                    setEnCorrection(null)
                    setRaison('')
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 10 }}>
              <button
                disabled={corriger.isPending || r.statut === 'validee'}
                onClick={() => corriger.mutate({ id: r.id, statut: 'validee' })}
              >
                Valider
              </button>
              <button
                className="link"
                disabled={r.statut === 'corrigee'}
                onClick={() => {
                  setEnCorrection(r.id)
                  setRaison('')
                }}
              >
                Corriger
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  )
}

/** Le lien : celui qu'elle transmet, et qu'elle peut couper d'un clic. */
function Lien({ boutique, etat }: { boutique: Boutique; etat: BoutiqueEtat }) {
  const couper = useCouperLienBoutique()
  const [copie, setCopie] = useState<'ok' | 'ko' | null>(null)
  const lien = etat.jeton ? lienBoutiqueUrl(etat.jeton) : null

  async function copier() {
    if (!lien) return
    try {
      await navigator.clipboard.writeText(lien)
      setCopie('ok')
    } catch {
      // Le presse-papier est parfois refusé (contexte non sécurisé, permission) : l'adresse
      // reste affichée dans le champ, on dit simplement quoi faire.
      setCopie('ko')
    }
  }

  return (
    <>
      <h2>Le lien de la boutique</h2>

      {!lien ? (
        <p className="empty">
          Aucun lien pour cette boutique. Il se crée avec elle, à l'ouverture du premier accès.
        </p>
      ) : (
        <div className="card">
          <label htmlFor="lien-boutique">L'adresse qu'elle ouvre</label>
          <input
            id="lien-boutique"
            readOnly
            value={lien}
            onFocus={(e) => e.currentTarget.select()}
          />

          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={copier}>Copier le lien</button>
            <div className="spacer" />
            {etat.lien_actif ? (
              <button
                className="link"
                disabled={couper.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Couper l'accès de « ${boutique.nom} » ? Elle ne verra plus ses pièces et ne pourra plus rien déclarer.`,
                    )
                  ) {
                    couper.mutate(boutique.id)
                  }
                }}
              >
                Couper l'accès
              </button>
            ) : (
              <span className="badge">accès coupé</span>
            )}
          </div>

          {copie === 'ok' && (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              C'est copié : colle-le dans ton mail ou ton message.
            </p>
          )}
          {copie === 'ko' && (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Le navigateur a refusé la copie automatique : sélectionne l'adresse ci-dessus et
              copie-la à la main.
            </p>
          )}
          {couper.isError && (
            <p className="muted" style={{ margin: '8px 0 0', color: 'var(--accent)' }}>
              {(couper.error as Error).message}
            </p>
          )}

          <p className="muted" style={{ margin: '10px 0 0' }}>
            {etat.lien_actif
              ? "Ce lien ne remplace aucun document contractuel : le bon signé reste la pièce qui fait foi. Elle ne voit que ses pièces à elle — jamais ton stock, ni les autres boutiques."
              : "Cet accès est coupé : le lien ne répond plus, son historique reste. Tu peux lui en redonner un quand tu veux."}
          </p>
        </div>
      )}
    </>
  )
}
