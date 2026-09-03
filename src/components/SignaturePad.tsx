import { useCallback, useEffect, useRef, useState } from 'react'

// Zone de signature tactile. Le tracé est exporté en JPEG sur fond blanc : c'est le format
// que le générateur de PDF sait embarquer directement (voir _shared/pdf-lite.ts).
export default function SignaturePad({
  onChange,
  disabled,
  hauteur = 180,
}: {
  onChange: (jpegBase64: string | null) => void
  disabled?: boolean
  hauteur?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dessine = useRef(false)
  const dernier = useRef<{ x: number; y: number } | null>(null)
  const videRef = useRef(true)
  const [vide, setVide] = useState(true)
  // onChange vient souvent d'une closure recréée à chaque rendu : on garde la dernière
  // version dans une ref pour ne pas réinitialiser le canvas à chaque frappe du formulaire.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const prepare = useCallback((c: HTMLCanvasElement, dpr: number) => {
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1a1a'
    return ctx
  }, [])

  // Le canvas est dimensionné à sa taille affichée × densité d'écran, sinon le tracé est flou.
  // Un redimensionnement (rotation, ouverture du clavier sur mobile) ne doit jamais effacer
  // une signature déjà tracée : on la redessine après coup.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ajuste = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const largeur = c.clientWidth || 300
      const w = Math.round(largeur * dpr)
      const h = Math.round(hauteur * dpr)
      if (c.width === w && c.height === h) return
      const avant = videRef.current ? null : c.toDataURL('image/png')
      c.width = w
      c.height = h
      const ctx = prepare(c, dpr)
      if (avant && ctx) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, largeur, hauteur)
        img.src = avant
      }
    }
    ajuste()
    window.addEventListener('resize', ajuste)
    window.addEventListener('orientationchange', ajuste)
    return () => {
      window.removeEventListener('resize', ajuste)
      window.removeEventListener('orientationchange', ajuste)
    }
  }, [hauteur, prepare])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function debut(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dessine.current = true
    dernier.current = point(e)
  }

  function bouge(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dessine.current || disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    const p = point(e)
    const d = dernier.current
    if (!ctx || !d) return
    // Segment lissé par une quadratique passant par le milieu : évite les angles.
    ctx.beginPath()
    ctx.moveTo(d.x, d.y)
    ctx.quadraticCurveTo(d.x, d.y, (d.x + p.x) / 2, (d.y + p.y) / 2)
    ctx.stroke()
    dernier.current = p
    if (videRef.current) {
      videRef.current = false
      setVide(false)
    }
  }

  function fin() {
    if (!dessine.current) return
    dessine.current = false
    dernier.current = null
    const c = canvasRef.current
    if (!c || videRef.current) return
    onChangeRef.current(c.toDataURL('image/jpeg', 0.85).split(',')[1] ?? null)
  }

  function effacer() {
    const c = canvasRef.current
    if (!c) return
    prepare(c, Math.min(window.devicePixelRatio || 1, 3))
    videRef.current = true
    setVide(true)
    onChangeRef.current(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="signature-pad"
        style={{ height: hauteur, opacity: disabled ? 0.5 : 1 }}
        onPointerDown={debut}
        onPointerMove={bouge}
        onPointerUp={fin}
        onPointerCancel={fin}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <span className="muted">
          {vide ? 'Signe avec le doigt dans le cadre.' : 'Signature enregistrée ✓'}
        </span>
        <div className="spacer" />
        <button type="button" className="link" onClick={effacer} disabled={disabled || vide}>
          Effacer
        </button>
      </div>
    </div>
  )
}
