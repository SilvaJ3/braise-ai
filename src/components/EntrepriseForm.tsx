import { useEffect, useState } from 'react'
import { PROFIL_VIDE, useProfilEntreprise, useSaveProfilEntreprise } from '../lib/depots'
import type { ProfilEntrepriseDraft } from '../lib/supabase'

// Ce bloc alimente l'en-tête et le pied des bons de dépôt : ce qui est saisi ici s'imprime
// tel quel sur le document envoyé aux boutiques.
export default function EntrepriseForm() {
  const { data, isLoading } = useProfilEntreprise()
  const save = useSaveProfilEntreprise()
  const [d, setD] = useState<ProfilEntrepriseDraft>(PROFIL_VIDE)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data && !dirty) setD(data)
  }, [data, dirty])

  const set = <K extends keyof ProfilEntrepriseDraft>(k: K, v: ProfilEntrepriseDraft[K]) => {
    setD((p) => ({ ...p, [k]: v }))
    setDirty(true)
  }

  if (isLoading) return <p className="muted">…</p>

  return (
    <div className="card stack">
      <p className="muted" style={{ marginTop: 0 }}>
        S'imprime en en-tête des bons de dépôt envoyés aux boutiques.
      </p>
      <label htmlFor="e-nom">Nom / enseigne</label>
      <input id="e-nom" value={d.nom} maxLength={200} onChange={(e) => set('nom', e.target.value)} />

      <label htmlFor="e-adresse">Adresse</label>
      <input id="e-adresse" value={d.adresse} maxLength={300} onChange={(e) => set('adresse', e.target.value)} />

      <div className="row">
        <div className="field-half">
          <label htmlFor="e-tel">Téléphone</label>
          <input id="e-tel" value={d.telephone} maxLength={50} onChange={(e) => set('telephone', e.target.value)} />
        </div>
        <div className="field-half">
          <label htmlFor="e-tva">N° d'entreprise</label>
          <input id="e-tva" value={d.tva} maxLength={50} onChange={(e) => set('tva', e.target.value)} />
        </div>
      </div>

      <label htmlFor="e-mail">Email affiché sur le bon</label>
      <input id="e-mail" type="email" value={d.email} maxLength={200} onChange={(e) => set('email', e.target.value)} />

      <label htmlFor="e-mention">Mention au-dessus de la signature</label>
      <textarea
        id="e-mention"
        value={d.mention_signature}
        maxLength={500}
        style={{ minHeight: 70 }}
        onChange={(e) => set('mention_signature', e.target.value)}
      />

      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="primary"
          disabled={save.isPending || !dirty}
          onClick={() => save.mutate(d, { onSuccess: () => setDirty(false) })}
        >
          {save.isPending ? '…' : 'Enregistrer'}
        </button>
        {!dirty && save.isSuccess && <span className="muted">Enregistré ✓</span>}
        {save.error && (
          <span className="muted" style={{ color: 'var(--accent)' }}>
            {(save.error as Error).message}
          </span>
        )}
      </div>
    </div>
  )
}
