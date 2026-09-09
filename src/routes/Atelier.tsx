import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Fab from '../components/Fab'
import FournisseurForm from '../components/FournisseurForm'
import ImportWizard from '../components/ImportWizard'
import MatiereForm from '../components/MatiereForm'
import Skeleton from '../components/Skeleton'
import {
  CATEGORIE_LABEL,
  fmtQty,
  sousSeuil,
  useBesoinsMatiere,
  useCreateFournisseur,
  useCreateMatiere,
  useDeleteFournisseur,
  useDeleteMatiere,
  useFournisseurs,
  useMatieres,
  useUpdateFournisseur,
  useUpdateMatiere,
} from '../lib/atelier'
import {
  CF_STATUT_LABEL,
  nextCfStatut,
  useArchiverCommandeFournisseur,
  useChangerStatutCommandeFournisseur,
  useCommandeFournisseur,
  useCommandesFournisseur,
  useCreerCommandeFournisseurDepuisBesoin,
  useDeleteCommandeFournisseur,
} from '../lib/commandesFournisseur'
import { fmtDateCourte } from '../lib/depots'
import type { ImportEntity } from '../lib/importer'
import type { Fournisseur, MatierePremiere } from '../lib/supabase'

type Tab = 'matieres' | 'besoins' | 'commandees' | 'fournisseurs' | 'import'
const TABS: Tab[] = ['matieres', 'besoins', 'commandees', 'fournisseurs', 'import']

// Message DB lisible (doublon de nom = index unique par utilisateur).
function friendly(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (/duplicate key|unique/i.test(msg)) return 'Ce nom existe déjà.'
  return msg
}

function MatieresTab() {
  const { data: matieres = [], isLoading, error } = useMatieres()
  const { data: fournisseurs = [] } = useFournisseurs()
  const create = useCreateMatiere()
  const update = useUpdateMatiere()
  const del = useDeleteMatiere()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MatierePremiere | null>(null)
  const [showInactives, setShowInactives] = useState(false)

  const fournisseurNom = useMemo(() => new Map(fournisseurs.map((f) => [f.id, f.nom])), [fournisseurs])
  const shown = matieres.filter((m) => showInactives || m.actif)
  const alertes = matieres.filter((m) => m.actif && sousSeuil(m))
  const openForm = creating || editing !== null

  return (
    <>
      {isLoading && <Skeleton rows={4} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {creating && (
        <MatiereForm
          fournisseurs={fournisseurs}
          busy={create.isPending}
          error={create.error ? friendly(create.error) : null}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) => create.mutate(draft, { onSuccess: () => setCreating(false) })}
        />
      )}
      {editing && (
        <MatiereForm
          initial={editing}
          fournisseurs={fournisseurs}
          busy={update.isPending}
          error={update.error ? friendly(update.error) : null}
          onCancel={() => setEditing(null)}
          onSubmit={(patch) => update.mutate({ id: editing.id, patch }, { onSuccess: () => setEditing(null) })}
        />
      )}

      {!isLoading && !error && !openForm && (
        <>
          {alertes.length > 0 && (
            <div className="banner">
              <strong>À recommander</strong>
              {alertes.map((m) => (
                <div className="row" key={m.id} style={{ marginTop: 6 }}>
                  <span>{m.nom}</span>
                  <span className="muted">
                    · {fmtQty(m.stock_actuel, m.unite)} / seuil {fmtQty(m.seuil_alerte as number, m.unite)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ marginBottom: 8 }}>
            <span className="muted">{shown.length} matière(s)</span>
            <div className="spacer" />
            <button className="link" onClick={() => setShowInactives((v) => !v)}>
              {showInactives ? 'Masquer inactives' : 'Voir inactives'}
            </button>
          </div>

          {shown.length === 0 && (
            <p className="empty">Aucune matière. Ajoute-les une par une, ou importe ton inventaire (onglet Importer).</p>
          )}

          {shown.map((m) => (
            <div className="card" key={m.id} style={{ opacity: m.actif ? 1 : 0.5 }}>
              <div className="row">
                <strong>{m.nom}</strong>
                <div className="spacer" />
                {sousSeuil(m) && m.actif && <span className="badge">⚠️ sous seuil</span>}
                <span className="badge">{fmtQty(m.stock_actuel, m.unite)}</span>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {m.categorie && <span className="muted">{CATEGORIE_LABEL[m.categorie]}</span>}
                {m.seuil_alerte != null && <span className="muted">· seuil {fmtQty(m.seuil_alerte, m.unite)}</span>}
                {m.prix_unitaire != null && <span className="muted">· {m.prix_unitaire} €/{m.unite === 'piece' ? 'pc' : m.unite}</span>}
                {m.fournisseur_id && fournisseurNom.get(m.fournisseur_id) && (
                  <span className="muted">· {fournisseurNom.get(m.fournisseur_id)}</span>
                )}
              </div>
              {m.notes && <p style={{ margin: '8px 0 0' }}>{m.notes}</p>}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="link" onClick={() => setEditing(m)}>
                  Modifier
                </button>
                <div className="spacer" />
                <button
                  className="link"
                  onClick={() => {
                    if (confirm(`Supprimer « ${m.nom} » ?`)) del.mutate(m.id)
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!openForm && <Fab onClick={() => setCreating(true)} />}
    </>
  )
}

// Groupé par fournisseur pour préparer une commande d'un coup ; « sans fournisseur »
// en dernier, à commander à la main faute d'un fournisseur renseigné sur la matière.
function BesoinsTab() {
  const { data: besoins, isLoading } = useBesoinsMatiere()
  const creer = useCreerCommandeFournisseurDepuisBesoin()
  const [commandee, setCommandee] = useState<string | null>(null)

  const groupes = useMemo(() => {
    const m = new Map<string, { fournisseur: Fournisseur | null; lignes: typeof besoins }>()
    for (const b of besoins) {
      const key = b.fournisseur?.id ?? ''
      const g = m.get(key) ?? { fournisseur: b.fournisseur, lignes: [] }
      g.lignes.push(b)
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => (a.fournisseur?.nom ?? '￿').localeCompare(b.fournisseur?.nom ?? '￿'))
  }, [besoins])

  if (isLoading) return <Skeleton rows={3} />

  if (besoins.length === 0) {
    return (
      <p className="empty">
        Rien à commander pour l'instant. Calculé depuis les commandes en cours et les recettes
        des bougies (Compte → Mes bougies → Recette).
      </p>
    )
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Besoin en matière pour les commandes en cours (demande, confirmée, en prod), comparé au
        stock actuel. Une ligne de commande marquée « déjà en stock » n'y compte pas.
      </p>
      {groupes.map((g) => (
        <div className="card" key={g.fournisseur?.id ?? 'sans-fournisseur'}>
          <strong>{g.fournisseur?.nom ?? 'Sans fournisseur'}</strong>
          {g.lignes.map((b) => (
            <div className="row" key={b.matiere.id} style={{ marginTop: 8 }}>
              <span>{b.matiere.nom}</span>
              <div className="spacer" />
              <span className="muted">
                {fmtQty(b.disponible, b.matiere.unite)} en stock · besoin {fmtQty(b.besoin, b.matiere.unite)}
              </span>
              <span className="badge">à commander {fmtQty(b.aCommander, b.matiere.unite)}</span>
            </div>
          ))}
          {g.fournisseur && (
            <div className="row" style={{ marginTop: 8 }}>
              {g.fournisseur.email && (
                <a className="muted" href={`mailto:${g.fournisseur.email}`}>
                  {g.fournisseur.email}
                </a>
              )}
              {g.fournisseur.telephone && (
                <a className="muted" href={`tel:${g.fournisseur.telephone}`}>
                  · {g.fournisseur.telephone}
                </a>
              )}
              <div className="spacer" />
              <button
                className="link"
                disabled={creer.isPending}
                onClick={() => {
                  const fournisseurId = g.fournisseur!.id
                  creer.mutate(
                    { fournisseurId, lignes: g.lignes.map((b) => ({ matiere_id: b.matiere.id, quantite: b.aCommander })) },
                    { onSuccess: () => setCommandee(fournisseurId) },
                  )
                }}
              >
                {creer.isPending ? 'Création…' : 'Commander'}
              </button>
            </div>
          )}
          {commandee === g.fournisseur?.id && (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              ✓ Commande créée — suivi dans l'onglet « Commandées ».
            </p>
          )}
        </div>
      ))}
      {creer.error && (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {(creer.error as Error).message}
        </p>
      )}
    </>
  )
}

function CommandeesTab() {
  const { data: commandes = [], isLoading, error } = useCommandesFournisseur()
  const { data: fournisseurs = [] } = useFournisseurs()
  const { data: matieres = [] } = useMatieres()
  const changerStatut = useChangerStatutCommandeFournisseur()
  const archiver = useArchiverCommandeFournisseur()
  const del = useDeleteCommandeFournisseur()
  const [voirArchivees, setVoirArchivees] = useState(false)

  const fournisseurNom = useMemo(() => new Map(fournisseurs.map((f) => [f.id, f.nom])), [fournisseurs])
  const matiereParId = useMemo(() => new Map(matieres.map((m) => [m.id, m])), [matieres])
  const shown = commandes.filter((c) => voirArchivees || !c.archived_at)

  if (isLoading) return <Skeleton rows={3} />
  if (error) return <p className="muted">Erreur : {(error as Error).message}</p>

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="muted">{shown.length} commande(s)</span>
        <div className="spacer" />
        <button className="link" onClick={() => setVoirArchivees((v) => !v)}>
          {voirArchivees ? 'Masquer archivées' : 'Voir archivées'}
        </button>
      </div>

      {shown.length === 0 && (
        <p className="empty">
          Aucune commande fournisseur. Elles se créent depuis l'onglet « À commander ».
        </p>
      )}

      {shown.map((c) => (
        <div className="card" key={c.id} style={{ opacity: c.archived_at ? 0.55 : 1 }}>
          <div className="row">
            <strong>{fournisseurNom.get(c.fournisseur_id) ?? 'Fournisseur'}</strong>
            <div className="spacer" />
            {c.archived_at && <span className="badge">Archivée</span>}
            <span className="badge">{CF_STATUT_LABEL[c.statut]}</span>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {c.date_reception
              ? `Reçue le ${fmtDateCourte(c.date_reception)}`
              : c.date_commande
                ? `Commandée le ${fmtDateCourte(c.date_commande)}`
                : 'Pas encore passée'}
          </p>
          <div style={{ margin: '8px 0 0' }}>
            <MatiereLignes commandeId={c.id} matiereParId={matiereParId} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {c.statut !== 'recue' && (
              <button
                className="link"
                disabled={changerStatut.isPending}
                onClick={() => changerStatut.mutate({ id: c.id, statut: nextCfStatut(c.statut) })}
              >
                Marquer {CF_STATUT_LABEL[nextCfStatut(c.statut)].toLowerCase()}
              </button>
            )}
            <div className="spacer" />
            {c.statut === 'recue' && !c.archived_at && (
              <button className="link" onClick={() => archiver.mutate({ id: c.id, archiver: true })}>
                Archiver
              </button>
            )}
            <button
              className="link"
              onClick={() => {
                if (confirm('Supprimer cette commande fournisseur ?')) del.mutate(c.id)
              }}
            >
              Supprimer
            </button>
          </div>
        </div>
      ))}
    </>
  )
}

// Lignes chargées à part (par commande, un aller-retour de plus) plutôt que dans la liste
// principale : la liste des commandes fournisseur reste courte en usage réel, pas besoin
// d'optimiser en amont.
function MatiereLignes({ commandeId, matiereParId }: { commandeId: string; matiereParId: Map<string, MatierePremiere> }) {
  const { data } = useCommandeFournisseur(commandeId)
  if (!data || data.lignes.length === 0) return null
  return (
    <p className="muted" style={{ margin: 0 }}>
      {data.lignes
        .map((l) => {
          const m = matiereParId.get(l.matiere_id)
          return m ? `${m.nom} (${fmtQty(l.quantite, m.unite)})` : '?'
        })
        .join(' · ')}
    </p>
  )
}

function FournisseursTab() {
  const { data: fournisseurs = [], isLoading, error } = useFournisseurs()
  const { data: matieres = [] } = useMatieres()
  const create = useCreateFournisseur()
  const update = useUpdateFournisseur()
  const del = useDeleteFournisseur()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Fournisseur | null>(null)

  const nbMatieres = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of matieres) if (x.fournisseur_id) m.set(x.fournisseur_id, (m.get(x.fournisseur_id) ?? 0) + 1)
    return m
  }, [matieres])
  const openForm = creating || editing !== null

  return (
    <>
      {isLoading && <Skeleton rows={3} />}
      {error && <p className="muted">Erreur : {(error as Error).message}</p>}

      {creating && (
        <FournisseurForm
          busy={create.isPending}
          error={create.error ? friendly(create.error) : null}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) => create.mutate(draft, { onSuccess: () => setCreating(false) })}
        />
      )}
      {editing && (
        <FournisseurForm
          initial={editing}
          busy={update.isPending}
          error={update.error ? friendly(update.error) : null}
          onCancel={() => setEditing(null)}
          onSubmit={(patch) => update.mutate({ id: editing.id, patch }, { onSuccess: () => setEditing(null) })}
        />
      )}

      {!isLoading && !error && !openForm && (
        <>
          {fournisseurs.length === 0 && <p className="empty">Aucun fournisseur pour l'instant.</p>}
          {fournisseurs.map((f) => (
            <div className="card" key={f.id} style={{ opacity: f.actif ? 1 : 0.5 }}>
              <div className="row">
                <strong>{f.nom}</strong>
                <div className="spacer" />
                {f.delai_livraison_jours != null && <span className="badge">délai {f.delai_livraison_jours} j</span>}
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {f.email && (
                  <a className="muted" href={`mailto:${f.email}`}>
                    {f.email}
                  </a>
                )}
                {f.telephone && (
                  <a className="muted" href={`tel:${f.telephone}`}>
                    · {f.telephone}
                  </a>
                )}
                {f.site_web && (
                  <a className="muted" href={/^https?:\/\//.test(f.site_web) ? f.site_web : `https://${f.site_web}`} target="_blank" rel="noreferrer">
                    · site ↗
                  </a>
                )}
              </div>
              {nbMatieres.get(f.id) ? (
                <p className="muted" style={{ margin: '6px 0 0' }}>{nbMatieres.get(f.id)} matière(s)</p>
              ) : null}
              {f.notes && <p style={{ margin: '8px 0 0' }}>{f.notes}</p>}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="link" onClick={() => setEditing(f)}>
                  Modifier
                </button>
                <div className="spacer" />
                <button
                  className="link"
                  onClick={() => {
                    if (confirm(`Supprimer « ${f.nom} » ? Les matières liées seront conservées, sans fournisseur.`)) del.mutate(f.id)
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {!openForm && <Fab onClick={() => setCreating(true)} />}
    </>
  )
}

export default function Atelier() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'matieres'
  const entityParam = params.get('entity')
  const initialEntity = (['produits', 'matieres_premieres', 'fournisseurs', 'boutiques'] as ImportEntity[]).includes(
    entityParam as ImportEntity,
  )
    ? (entityParam as ImportEntity)
    : undefined

  const go = (t: Tab) => setParams(t === 'matieres' ? {} : { tab: t }, { replace: true })

  return (
    <>
      <h1>Atelier</h1>
      <div className="subnav">
        <a className={tab === 'matieres' ? 'active' : ''} onClick={() => go('matieres')}>
          Matières
        </a>
        <a className={tab === 'besoins' ? 'active' : ''} onClick={() => go('besoins')}>
          À commander
        </a>
        <a className={tab === 'commandees' ? 'active' : ''} onClick={() => go('commandees')}>
          Commandées
        </a>
        <a className={tab === 'fournisseurs' ? 'active' : ''} onClick={() => go('fournisseurs')}>
          Fournisseurs
        </a>
        <a className={tab === 'import' ? 'active' : ''} onClick={() => go('import')}>
          Importer
        </a>
      </div>

      {tab === 'matieres' && <MatieresTab />}
      {tab === 'besoins' && <BesoinsTab />}
      {tab === 'commandees' && <CommandeesTab />}
      {tab === 'fournisseurs' && <FournisseursTab />}
      {tab === 'import' && <ImportWizard key={initialEntity ?? 'default'} initialEntity={initialEntity} />}
    </>
  )
}
