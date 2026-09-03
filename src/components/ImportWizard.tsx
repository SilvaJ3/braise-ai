import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { logEvent } from '../lib/events'
import {
  ACCEPTED_EXTENSIONS,
  ENTITIES,
  IMPORT_ENTITIES,
  MAX_FILE_BYTES,
  analyseFile,
  applyPlan,
  buildPlan,
  rowKey,
  type ApplyResult,
  type ImportEntity,
  type ImportResult,
  type PlanItem,
} from '../lib/importer'

type Step = 'choix' | 'analyse' | 'apercu' | 'import' | 'fini'

// Clé React Query à invalider après import, par entité.
const QUERY_KEYS: Record<ImportEntity, string[]> = {
  produits: ['produits'],
  matieres_premieres: ['matieres_premieres', 'fournisseurs'],
  fournisseurs: ['fournisseurs'],
  boutiques: ['boutiques'],
}

const ACCEPT = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',')

function summary(entity: ImportEntity, row: PlanItem['row']): string {
  const def = ENTITIES[entity]
  return def.fields
    .filter((f) => f.key !== 'nom' && f.key !== 'actif' && f.key !== 'description' && f.key !== 'notes')
    .map((f) => {
      const v = row[f.key]
      if (v == null || v === '') return null
      if (f.type === 'number' && (f.key.startsWith('prix') || f.key === 'prix_vente')) return `${v} €`
      return String(v)
    })
    .filter(Boolean)
    .join(' · ')
}

export default function ImportWizard({ initialEntity }: { initialEntity?: ImportEntity }) {
  const qc = useQueryClient()
  const [entity, setEntity] = useState<ImportEntity>(initialEntity ?? 'matieres_premieres')
  const [step, setStep] = useState<Step>('choix')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [applied, setApplied] = useState<ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('choix')
    setResult(null)
    setPlan([])
    setApplied(null)
    setError(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.size > MAX_FILE_BYTES) {
      setError('Fichier trop volumineux (max 6 Mo).')
      return
    }
    setFileName(file.name)
    setStep('analyse')
    logEvent('import_start', { entity, ext: file.name.split('.').pop() })
    try {
      const r = await analyseFile(entity, file)
      setResult(r)
      const p = await buildPlan(entity, r.rows)
      setPlan(p)
      setStep('apercu')
    } catch (e) {
      setError((e as Error).message)
      setStep('choix')
    }
  }

  async function confirm() {
    setStep('import')
    setError(null)
    try {
      const r = await applyPlan(entity, plan)
      setApplied(r)
      for (const k of QUERY_KEYS[entity]) qc.invalidateQueries({ queryKey: [k] })
      logEvent('import_done', { entity, created: r.created, updated: r.updated, errors: r.errors.length })
      setStep('fini')
    } catch (e) {
      setError((e as Error).message)
      setStep('apercu')
    }
  }

  const toggle = (i: number) =>
    setPlan((p) => p.map((it, j) => (j === i ? { ...it, selected: !it.selected } : it)))
  const setAll = (selected: boolean) => setPlan((p) => p.map((it) => ({ ...it, selected })))

  const nbNew = plan.filter((p) => p.selected && p.action === 'nouveau').length
  const nbMaj = plan.filter((p) => p.selected && p.action === 'maj').length

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Excel (.xlsx), CSV, PDF, photo d'un tableau, texte… L'assistant lit le fichier et te
        montre ce qu'il a compris avant d'enregistrer. Rien n'est écrit sans ta confirmation.
      </p>

      {step === 'choix' && (
        <div className="card stack">
          <label htmlFor="imp-entity">Quoi importer ?</label>
          <select id="imp-entity" value={entity} onChange={(e) => setEntity(e.target.value as ImportEntity)}>
            {IMPORT_ENTITIES.map((k) => (
              <option key={k} value={k}>
                {ENTITIES[k].label}
              </option>
            ))}
          </select>
          <p className="muted" style={{ margin: '4px 0 0' }}>{ENTITIES[entity].hint}</p>

          <label htmlFor="imp-file" style={{ marginTop: 8 }}>
            Fichier
          </label>
          <input
            id="imp-file"
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          {error && (
            <p className="muted" style={{ color: 'var(--accent)' }}>
              {error}
            </p>
          )}
        </div>
      )}

      {step === 'analyse' && (
        <div className="card">
          <p style={{ margin: 0 }}>
            <strong>{fileName}</strong>
          </p>
          <p className="muted">Lecture en cours… (jusqu'à une minute pour un gros fichier ou un PDF)</p>
          <div className="skeleton" style={{ marginBottom: 8 }} />
          <div className="skeleton" style={{ width: '70%' }} />
        </div>
      )}

      {(step === 'apercu' || step === 'import') && result && (
        <>
          <div className="card stack">
            <div className="row">
              <strong>{fileName}</strong>
              <div className="spacer" />
              <span className="badge">{result.source === 'ia' ? 'lu par l’IA' : 'lu par en-têtes'}</span>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {plan.length} {ENTITIES[entity].labelSingular}(s) trouvée(s) ·{' '}
              {plan.filter((p) => p.action === 'nouveau').length} nouvelle(s) ·{' '}
              {plan.filter((p) => p.action === 'maj').length} déjà connue(s)
            </p>
            {result.warnings.length > 0 && (
              <details>
                <summary className="muted" style={{ cursor: 'pointer' }}>
                  {result.warnings.length} remarque(s)
                </summary>
                <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {plan.length > 0 && (
            <div className="row" style={{ margin: '4px 0 8px' }}>
              <button className="link" onClick={() => setAll(true)}>
                Tout cocher
              </button>
              <button className="link" onClick={() => setAll(false)}>
                Tout décocher
              </button>
            </div>
          )}

          {plan.map((it, i) => (
            <label className="card row import-row" key={rowKey(entity, it.row, i)} style={{ opacity: it.selected ? 1 : 0.5 }}>
              <input type="checkbox" checked={it.selected} onChange={() => toggle(i)} style={{ width: 'auto', minHeight: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row">
                  <strong style={{ overflowWrap: 'anywhere' }}>{String(it.row.nom)}</strong>
                  <div className="spacer" />
                  <span className="badge">
                    {it.action === 'nouveau' ? 'nouveau' : it.changes.length ? `maj : ${it.changes.join(', ')}` : 'identique'}
                  </span>
                </div>
                {summary(entity, it.row) && (
                  <p className="muted" style={{ margin: '4px 0 0' }}>{summary(entity, it.row)}</p>
                )}
              </div>
            </label>
          ))}

          {plan.length === 0 && <p className="empty">Rien d'exploitable dans ce fichier.</p>}

          {error && (
            <p className="muted" style={{ color: 'var(--accent)' }}>
              {error}
            </p>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={confirm} disabled={step === 'import' || nbNew + nbMaj === 0}>
              {step === 'import'
                ? 'Enregistrement…'
                : `Importer (${nbNew} nouveau${nbNew > 1 ? 'x' : ''}, ${nbMaj} maj)`}
            </button>
            <button onClick={reset} disabled={step === 'import'}>
              Annuler
            </button>
          </div>
        </>
      )}

      {step === 'fini' && applied && (
        <div className="card stack">
          <p style={{ margin: 0 }}>
            <strong>Import terminé.</strong>
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {applied.created} créé(s), {applied.updated} mis à jour
            {applied.fournisseursCrees ? `, ${applied.fournisseursCrees} fournisseur(s) créé(s)` : ''}.
          </p>
          {applied.errors.length > 0 && (
            <ul className="muted" style={{ margin: 0, paddingLeft: 18, color: 'var(--accent)' }}>
              {applied.errors.slice(0, 20).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <div>
            <button onClick={reset}>Importer un autre fichier</button>
          </div>
        </div>
      )}
    </>
  )
}
