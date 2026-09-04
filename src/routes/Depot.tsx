import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SignaturePad from '../components/SignaturePad'
import Skeleton from '../components/Skeleton'
import { useBoutiques } from '../lib/boutiques'
import { ymd } from '../lib/dates'
import {
  apercuDepot,
  docDepuisSaisie,
  fmtEuro,
  parseEmails,
  problemesEnvoi,
  saveDepot,
  STATUT_LABEL,
  totalDoc,
  urlPdfDepot,
  useArchiverDepot,
  useDepot,
  useEnvoyerDepot,
  useProfilEntreprise,
  type DepotSaisie,
} from '../lib/depots'
import { logEvent } from '../lib/events'
import { useProduits } from '../lib/produits'

type LigneSaisie = DepotSaisie['lignes'][number] & { cle: string; libre: boolean }

const cle = () => Math.random().toString(36).slice(2)

const nombre = (v: string): number => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export default function Depot() {
  const { boutiqueId, depotId } = useParams()
  const navigate = useNavigate()
  const { data: boutiques = [] } = useBoutiques()
  const { data: produits = [] } = useProduits()
  const { data: profil } = useProfilEntreprise()
  const existant = useDepot(depotId)
  const envoyer = useEnvoyerDepot()
  const archiver = useArchiverDepot()

  const [date, setDate] = useState(ymd())
  const [lignes, setLignes] = useState<LigneSaisie[]>([])
  const [notes, setNotes] = useState('')
  const [destinataires, setDestinataires] = useState('')
  const [copie, setCopie] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [signataire, setSignataire] = useState('')
  const [apercu, setApercu] = useState<{ url: string; filename: string } | null>(null)
  const [busy, setBusy] = useState<'' | 'apercu' | 'envoi'>('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const charge = useRef(false)
  // true seulement si l'écran a été ouvert directement sur un bon existant (venu de la fiche
  // boutique). Un nouveau bon obtient un depotId après le premier enregistrement (Aperçu,
  // Enregistrer…) : sans ce garde-fou, le rechargement qui suit écraserait destinataire/copie
  // avec les valeurs vides de la ligne qu'on vient tout juste de créer.
  const ouvertSurExistant = useRef(!!depotId)

  const boutique = useMemo(
    () => boutiques.find((b) => b.id === (boutiqueId ?? existant.data?.depot.boutique_id)),
    [boutiques, boutiqueId, existant.data],
  )
  const depot = existant.data?.depot
  const verrouille = depot?.statut === 'envoye'

  // Chargement d'un bon existant (une seule fois, pour ne pas écraser la saisie en cours).
  useEffect(() => {
    if (!existant.data || charge.current || !ouvertSurExistant.current) return
    charge.current = true
    const { depot: d, lignes: ls } = existant.data
    setDate(d.date_depot)
    setNotes(d.notes ?? '')
    setSignataire(d.signataire_nom ?? '')
    setDestinataires(d.email_to.join(', '))
    setCopie(d.email_cc.join(', '))
    setLignes(
      ls.map((l) => ({
        cle: l.id,
        produit_id: l.produit_id,
        designation: l.designation,
        quantite: Number(l.quantite),
        prix_unitaire: Number(l.prix_unitaire),
        libre: !l.produit_id,
      })),
    )
  }, [existant.data])

  // Nouveau bon : destinataire = contact de la boutique, copie = adresse de l'artisane.
  useEffect(() => {
    if (depotId || !boutique) return
    setDestinataires((d) => d || boutique.email || '')
  }, [boutique, depotId])
  useEffect(() => {
    if (depotId || !profil?.email) return
    setCopie((c) => c || profil.email)
  }, [profil, depotId])

  useEffect(() => () => {
    if (apercu) URL.revokeObjectURL(apercu.url)
  }, [apercu])

  const saisie: DepotSaisie = {
    id: depotId,
    boutique_id: boutique?.id ?? null,
    date_depot: date,
    boutique_nom: boutique?.nom ?? depot?.boutique_nom ?? '',
    boutique_adresse: boutique?.adresse ?? depot?.boutique_adresse ?? null,
    boutique_email: boutique?.email ?? depot?.boutique_email ?? null,
    notes: notes || null,
    lignes: lignes.map(({ cle: _cle, libre: _libre, ...l }) => l),
  }

  const doc = docDepuisSaisie(saisie, profil ?? { nom: '', adresse: '', telephone: '', tva: '', email: '', mention_signature: '' }, signature, signataire)
  const tousDestinataires = [...parseEmails(destinataires).valid, ...parseEmails(copie).valid]
  const problemes = problemesEnvoi(doc, tousDestinataires)
  const total = totalDoc(doc.lignes)

  function setLigne(i: number, patch: Partial<LigneSaisie>) {
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  /** Le sélecteur ne sert qu'à poser une ligne : il se remet à zéro juste après. */
  function ajouterArticle(valeur: string) {
    if (!valeur) return
    if (valeur === 'libre') {
      setLignes((ls) => [...ls, { cle: cle(), produit_id: null, designation: '', quantite: 1, prix_unitaire: 0, libre: true }])
      return
    }
    const p = produits.find((x) => x.id === valeur)
    if (!p) return
    setLignes((ls) => [
      ...ls,
      { cle: cle(), produit_id: p.id, designation: p.nom, quantite: 1, prix_unitaire: Number(p.prix_vente ?? 0), libre: false },
    ])
  }

  async function enregistrer(): Promise<string> {
    const id = await saveDepot(saisie)
    if (!depotId) navigate(`/depots/${id}`, { replace: true })
    return id
  }

  async function voirApercu() {
    setBusy('apercu')
    setErreur(null)
    try {
      const id = await enregistrer()
      if (apercu) URL.revokeObjectURL(apercu.url)
      setApercu(await apercuDepot(id, signature, signataire))
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  async function signerEtEnvoyer() {
    setBusy('envoi')
    setErreur(null)
    try {
      const id = await enregistrer()
      const r = await envoyer.mutateAsync({
        depot_id: id,
        signature_image: signature,
        signataire_nom: signataire,
        email_to: destinataires,
        email_cc: copie,
      })
      logEvent('depot_envoye', { numero: r.numero, destinataires: r.sent_to.length })
      await existant.refetch()
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  async function ouvrirPdfArchive() {
    if (!depot?.pdf_path) return
    setPdfUrl(await urlPdfDepot(depot.pdf_path))
  }

  if (depotId && existant.isLoading) return <Skeleton rows={5} />
  if (depotId && !existant.isLoading && !depot) return <p className="empty">Bon de dépôt introuvable.</p>

  return (
    <>
      <button className="link" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        ← Retour
      </button>

      <div className="row">
        <h1 style={{ margin: 0 }}>Bon de dépôt</h1>
        <div className="spacer" />
        {depot?.archived_at && <span className="badge">Archivé</span>}
        {depot && <span className="badge">{STATUT_LABEL[depot.statut]}</span>}
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {saisie.boutique_nom || 'Boutique inconnue'}
        {depot?.numero ? ` · n° ${depot.numero}` : ''}
      </p>
      {depot && (
        <button
          className="link"
          style={{ marginBottom: 8 }}
          disabled={archiver.isPending}
          onClick={() => archiver.mutate({ id: depot.id, archiver: !depot.archived_at })}
        >
          {depot.archived_at ? 'Désarchiver ce bon' : 'Archiver ce bon'}
        </button>
      )}

      {depot?.statut === 'envoye' && (
        <div className="banner">
          <strong>Envoyé</strong>
          <p style={{ margin: '6px 0 0' }}>
            À {depot.email_to.concat(depot.email_cc).join(', ')}
            {depot.sent_at ? ` le ${new Date(depot.sent_at).toLocaleString('fr-BE')}` : ''}.
          </p>
          {depot.pdf_path && (
            <div className="row" style={{ marginTop: 8 }}>
              {pdfUrl ? (
                <a href={pdfUrl} target="_blank" rel="noreferrer">
                  Ouvrir le PDF ↗
                </a>
              ) : (
                <button className="link" onClick={ouvrirPdfArchive}>
                  Voir le PDF signé
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {depot?.send_error && depot.statut !== 'envoye' && (
        <div className="banner">
          <strong>Envoi en échec</strong>
          <p style={{ margin: '6px 0 0' }}>{depot.send_error}</p>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Le bon est signé et conservé : tu peux relancer l'envoi sans refaire signer.
          </p>
        </div>
      )}

      <div className="card stack">
        <label htmlFor="date">Date du dépôt</label>
        <input id="date" type="date" value={date} disabled={verrouille} onChange={(e) => setDate(e.target.value)} />
      </div>

      <h2>Articles déposés</h2>
      <div className="card">
        {lignes.length === 0 && (
          <p className="empty" style={{ margin: '0 0 10px' }}>
            Ajoute les articles que tu déposes, un par un.
          </p>
        )}

        {lignes.map((l, i) => (
          <div className="depot-item" key={l.cle}>
            <div className="row">
              {l.libre ? (
                <input
                  value={l.designation}
                  placeholder="Nom de l'article"
                  disabled={verrouille}
                  autoFocus
                  onChange={(e) => setLigne(i, { designation: e.target.value })}
                  style={{ minHeight: 34, padding: '4px 8px' }}
                />
              ) : (
                <strong>{l.designation}</strong>
              )}
              <div className="spacer" />
              {!verrouille && (
                <button
                  type="button"
                  className="del"
                  aria-label={`Retirer ${l.designation || 'la ligne'}`}
                  onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              )}
            </div>
            <div className="row depot-item-detail">
              <input
                inputMode="decimal"
                aria-label="Quantité"
                value={String(l.quantite)}
                disabled={verrouille}
                onChange={(e) => setLigne(i, { quantite: nombre(e.target.value) })}
              />
              <span className="muted">×</span>
              <input
                inputMode="decimal"
                aria-label="Prix unitaire"
                value={String(l.prix_unitaire)}
                disabled={verrouille}
                onChange={(e) => setLigne(i, { prix_unitaire: nombre(e.target.value) })}
              />
              <span className="muted">€</span>
              <div className="spacer" />
              <span>{fmtEuro(l.quantite * l.prix_unitaire)}</span>
            </div>
          </div>
        ))}

        {!verrouille && (
          <select
            aria-label="Ajouter un article"
            value=""
            onChange={(e) => {
              ajouterArticle(e.target.value)
              e.target.value = ''
            }}
            style={{ marginTop: lignes.length ? 10 : 0 }}
          >
            <option value="">+ Ajouter un article…</option>
            {produits
              .filter((p) => p.actif)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                  {p.prix_vente != null ? ` · ${p.prix_vente} €` : ''}
                </option>
              ))}
            <option value="libre">Autre (saisie libre)…</option>
          </select>
        )}

        {lignes.length > 0 && (
          <div className="depot-total">
            <span>Total (prix de vente TTC)</span>
            <span>{fmtEuro(total)}</span>
          </div>
        )}
      </div>

      <div className="card stack">
        <label htmlFor="notes">Note sur le bon (optionnel)</label>
        <textarea
          id="notes"
          value={notes}
          disabled={verrouille}
          placeholder="Réassort prévu mi-octobre…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <h2>Signature de la boutique</h2>
      <div className="card stack">
        <label htmlFor="signataire">Nom du signataire</label>
        <input
          id="signataire"
          value={signataire}
          disabled={verrouille}
          placeholder="Prénom Nom"
          onChange={(e) => setSignataire(e.target.value)}
        />
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {profil?.mention_signature}
        </p>
        <SignaturePad onChange={setSignature} disabled={verrouille} />
      </div>

      <h2>Envoi</h2>
      <div className="card stack">
        <label htmlFor="to">Destinataire</label>
        <input
          id="to"
          type="email"
          value={destinataires}
          disabled={verrouille}
          placeholder="contact@laboutique.be"
          onChange={(e) => setDestinataires(e.target.value)}
        />
        <label htmlFor="cc">Copie à</label>
        <input
          id="cc"
          type="email"
          value={copie}
          disabled={verrouille}
          placeholder="toi@exemple.be"
          onChange={(e) => setCopie(e.target.value)}
        />
        <p className="muted" style={{ margin: 0 }}>
          Plusieurs adresses : sépare-les par une virgule.
        </p>
      </div>

      {erreur && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {erreur}
        </p>
      )}

      {!verrouille && problemes.length > 0 && (
        <ul className="muted" style={{ paddingLeft: 18 }}>
          {problemes.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {!verrouille && (
        <div className="row" style={{ marginTop: 12, marginBottom: 24 }}>
          <button
            className="primary"
            disabled={busy !== '' || problemes.length > 0}
            onClick={signerEtEnvoyer}
          >
            {busy === 'envoi' ? 'Envoi…' : 'Signer et envoyer'}
          </button>
          <button disabled={busy !== ''} onClick={voirApercu}>
            {busy === 'apercu' ? '…' : 'Aperçu'}
          </button>
          <button
            className="link"
            disabled={busy !== ''}
            onClick={() => enregistrer().catch((e) => setErreur((e as Error).message))}
          >
            Enregistrer
          </button>
        </div>
      )}

      {apercu && (
        <div className="card">
          <div className="row">
            <strong>Aperçu</strong>
            <div className="spacer" />
            <a href={apercu.url} target="_blank" rel="noreferrer">
              Ouvrir ↗
            </a>
            <button className="link" onClick={() => setApercu(null)}>
              Fermer
            </button>
          </div>
          <iframe
            title="Aperçu du bon de dépôt"
            src={apercu.url}
            style={{ width: '100%', height: 460, border: '1px solid var(--line)', borderRadius: 'var(--radius)', marginTop: 8 }}
          />
        </div>
      )}
    </>
  )
}
