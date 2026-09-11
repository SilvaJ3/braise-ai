import { useRef, useState } from 'react'

const MAX_DIM = 1400 // px, au-delà inutile pour un PDF et ça alourdit l'envoi pour rien
const QUALITE = 0.72

/** Redimensionne et recompresse une photo prise/choisie par l'utilisateur en JPEG base64
 *  (sans préfixe data:), pour rester dans un budget raisonnable une fois embarquée dans le PDF. */
async function compresser(fichier: File): Promise<string> {
  const bitmap = await createImageBitmap(fichier)
  const echelle = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * echelle)
  const h = Math.round(bitmap.height * echelle)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponible')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', QUALITE).split(',')[1] ?? ''
}

// Photo de l'état des articles au moment du dépôt (ex. les bougies sur le présentoir de la
// boutique) : un complément visuel au bon, un seul cliché pour l'instant.
export default function PhotoInput({
  valeur,
  onChange,
  disabled,
}: {
  valeur: string | null
  onChange: (jpegBase64: string | null) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    setErreur(null)
    setBusy(true)
    try {
      onChange(await compresser(fichier))
    } catch {
      setErreur('Photo illisible, réessaie.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {valeur ? (
        <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
          <img
            src={`data:image/jpeg;base64,${valeur}`}
            alt="Photo du dépôt"
            style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}
          />
          <div className="stack">
            <span className="muted">Photo ajoutée ✓</span>
            {!disabled && (
              <button type="button" className="link" onClick={() => onChange(null)}>
                Retirer
              </button>
            )}
          </div>
        </div>
      ) : (
        <button type="button" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Traitement…' : '📷 Prendre une photo'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={choisir}
      />
      {erreur && (
        <p className="muted" style={{ color: 'var(--accent)', marginTop: 6 }}>
          {erreur}
        </p>
      )}
    </div>
  )
}
