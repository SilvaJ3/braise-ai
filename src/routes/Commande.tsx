import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Skeleton from '../components/Skeleton'
import {
  saveCommande,
  STATUT_LABEL,
  STATUT_ORDER,
  useArchiverCommande,
  useCommande,
  type CommandeSaisie,
} from '../lib/commandes'
import { useBoutiques } from '../lib/boutiques'
import { ymd } from '../lib/dates'
import { useProduits } from '../lib/produits'
import type { CommandeType } from '../lib/supabase'

type LigneSaisie = CommandeSaisie['lignes'][number] & { cle: string }

const cle = () => Math.random().toString(36).slice(2)

const nombre = (v: string): number => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export default function Commande() {
  const { boutiqueId, commandeId } = useParams()
  const navigate = useNavigate()
  const { data: boutiques = [] } = useBoutiques()
  const { data: produits = [] } = useProduits()
  const existant = useCommande(commandeId)
  const archiver = useArchiverCommande()

  const [type, setType] = useState<CommandeType>(boutiqueId ? 'boutique' : 'personne')
  const [clientNom, setClientNom] = useState('')
  const [dateEcheance, setDateEcheance] = useState(ymd())
  const [statut, setStatut] = useState<CommandeSaisie['statut']>('demande')
  const [lignes, setLignes] = useState<LigneSaisie[]>([])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const charge = useRef(false)

  const commande = existant.data?.commande

  // Chargement d'une commande existante (une seule fois).
  useEffect(() => {
    if (!existant.data || charge.current) return
    charge.current = true
    const { commande: c, lignes: ls } = existant.data
    setType(c.type)
    setClientNom(c.client_nom ?? '')
    setDateEcheance(c.date_echeance)
    setStatut(c.statut)
    setNotes(c.notes ?? '')
    setLignes(
      ls.map((l) => ({
        cle: l.id,
        produit_id: l.produit_id,
        designation: l.designation,
        couleur: l.couleur,
        quantite: Number(l.quantite),
      })),
    )
  }, [existant.data])

  const boutique = useMemo(
    () => boutiques.find((b) => b.id === (boutiqueId ?? commande?.boutique_id)),
    [boutiques, boutiqueId, commande],
  )

  const saisie: CommandeSaisie = {
    id: commandeId,
    type,
    boutique_id: type === 'boutique' ? boutique?.id ?? null : null,
    client_nom: type === 'personne' ? clientNom : null,
    date_echeance: dateEcheance,
    statut,
    notes: notes || null,
    lignes: lignes.map(({ cle: _cle, ...l }) => l),
  }

  const cible = type === 'boutique' ? boutique?.nom : clientNom
  const pretAEnregistrer = !!cible && lignes.some((l) => l.designation.trim() && l.quantite > 0)

  function setLigne(i: number, patch: Partial<LigneSaisie>) {
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  /** Le sélecteur ne sert qu'à poser une ligne : il se remet à zéro juste après. */
  function ajouterArticle(valeur: string) {
    if (!valeur) return
    if (valeur === 'libre') {
      setLignes((ls) => [...ls, { cle: cle(), produit_id: null, designation: '', couleur: null, quantite: 1 }])
      return
    }
    const p = produits.find((x) => x.id === valeur)
    if (!p) return
    setLignes((ls) => [...ls, { cle: cle(), produit_id: p.id, designation: p.nom, couleur: null, quantite: 1 }])
  }

  async function enregistrer() {
    setBusy(true)
    setErreur(null)
    try {
      const id = await saveCommande(saisie)
      navigate(`/commandes/${id}`, { replace: true })
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (commandeId && existant.isLoading) return <Skeleton rows={5} />
  if (commandeId && !existant.isLoading && !commande) return <p className="empty">Commande introuvable.</p>

  return (
    <>
      <button className="link" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        ← Retour
      </button>

      <div className="row">
        <h1 style={{ margin: 0 }}>Commande</h1>
        <div className="spacer" />
        {commande?.archived_at && <span className="badge">Archivée</span>}
        {commande && <span className="badge">{STATUT_LABEL[commande.statut]}</span>}
      </div>

      {commande && (
        <button
          className="link"
          style={{ marginBottom: 8 }}
          disabled={archiver.isPending}
          onClick={() => archiver.mutate({ id: commande.id, archiver: !commande.archived_at })}
        >
          {commande.archived_at ? 'Désarchiver cette commande' : 'Archiver cette commande'}
        </button>
      )}

      {!boutiqueId && (
        <div className="card stack">
          <label htmlFor="type">Pour</label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as CommandeType)}
          >
            <option value="personne">Une personne</option>
            <option value="boutique">Une boutique (dépôt-vente)</option>
          </select>
        </div>
      )}

      <div className="card stack">
        {type === 'personne' ? (
          <>
            <label htmlFor="client">Nom de la personne</label>
            <input
              id="client"
              value={clientNom}
              placeholder="Prénom Nom"
              onChange={(e) => setClientNom(e.target.value)}
            />
          </>
        ) : (
          <>
            <label htmlFor="boutique">Boutique</label>
            {boutiqueId ? (
              <strong>{boutique?.nom ?? '…'}</strong>
            ) : (
              <select id="boutique" value={boutique?.id ?? ''} disabled>
                <option value="">Choisis une boutique depuis sa fiche</option>
              </select>
            )}
          </>
        )}

        <label htmlFor="date-echeance">Date prévue</label>
        <input
          id="date-echeance"
          type="date"
          value={dateEcheance}
          onChange={(e) => setDateEcheance(e.target.value)}
        />

        <label htmlFor="statut">Statut</label>
        <select id="statut" value={statut} onChange={(e) => setStatut(e.target.value as CommandeSaisie['statut'])}>
          {STATUT_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <h2>Bougies commandées</h2>
      <div className="card">
        {lignes.length === 0 && (
          <p className="empty" style={{ margin: '0 0 10px' }}>
            Ajoute les bougies commandées, une par une.
          </p>
        )}

        {lignes.map((l, i) => (
          <div className="depot-item" key={l.cle}>
            <div className="row">
              {l.produit_id ? (
                <strong>{l.designation}</strong>
              ) : (
                <input
                  value={l.designation}
                  placeholder="Nom de la bougie"
                  autoFocus
                  onChange={(e) => setLigne(i, { designation: e.target.value })}
                  style={{ minHeight: 34, padding: '4px 8px' }}
                />
              )}
              <div className="spacer" />
              <button
                type="button"
                className="del"
                aria-label={`Retirer ${l.designation || 'la ligne'}`}
                onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            <div className="row depot-item-detail">
              <input
                aria-label="Couleur"
                placeholder="Couleur"
                value={l.couleur ?? ''}
                onChange={(e) => setLigne(i, { couleur: e.target.value })}
              />
              <input
                inputMode="decimal"
                aria-label="Quantité"
                value={String(l.quantite)}
                onChange={(e) => setLigne(i, { quantite: nombre(e.target.value) })}
              />
            </div>
          </div>
        ))}

        <select
          aria-label="Ajouter une bougie"
          value=""
          onChange={(e) => {
            ajouterArticle(e.target.value)
            e.target.value = ''
          }}
          style={{ marginTop: lignes.length ? 10 : 0 }}
        >
          <option value="">+ Ajouter une bougie…</option>
          {produits
            .filter((p) => p.actif)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          <option value="libre">Autre (saisie libre)…</option>
        </select>
      </div>

      <div className="card stack">
        <label htmlFor="notes">Note (optionnel)</label>
        <textarea
          id="notes"
          value={notes}
          placeholder="Détails, préférences du client…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {erreur && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {erreur}
        </p>
      )}

      <div className="row" style={{ marginTop: 12, marginBottom: 24 }}>
        <button className="primary" disabled={busy || !pretAEnregistrer} onClick={enregistrer}>
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </>
  )
}
