import { CANAUX, PLATEFORMES, type Canaux } from '../lib/profil'

// Champs du profil de compte, partagés par le tunnel d'accueil et l'écran Compte → Mes
// informations : les deux doivent poser exactement les mêmes questions, dans le même ordre,
// sinon on corrige un libellé d'un côté et pas de l'autre.

export type ValeursProfil = {
  metier: string
  nomCommercial: string
  ville: string
  canaux: Canaux[]
  plateformes: string[]
}

export const VALEURS_VIDES: ValeursProfil = {
  metier: '',
  nomCommercial: '',
  ville: '',
  canaux: [],
  plateformes: [],
}

type Props = {
  valeurs: ValeursProfil
  onChange: (patch: Partial<ValeursProfil>) => void
}

export function ChampsActivite({ valeurs, onChange }: Props) {
  return (
    <>
      <label htmlFor="metier">Ton métier, en un mot ou deux</label>
      <input
        id="metier"
        value={valeurs.metier}
        onChange={(e) => onChange({ metier: e.target.value })}
        placeholder="céramiste, savonnier, illustrateur, bougies…"
        maxLength={80}
        required
      />

      <label htmlFor="nom-commercial">Nom commercial (optionnel)</label>
      <input
        id="nom-commercial"
        value={valeurs.nomCommercial}
        onChange={(e) => onChange({ nomCommercial: e.target.value })}
        placeholder="ce qui est écrit sur ton étiquette"
        maxLength={80}
      />

      <label htmlFor="ville">Où tu fabriques (optionnel)</label>
      <input
        id="ville"
        value={valeurs.ville}
        onChange={(e) => onChange({ ville: e.target.value })}
        placeholder="Namur, Ixelles…"
        maxLength={80}
      />
    </>
  )
}

export function ChampsCanaux({ valeurs, onChange }: Props) {
  const basculer = (canal: Canaux) => {
    const choisis = valeurs.canaux.includes(canal)
      ? valeurs.canaux.filter((c) => c !== canal)
      : [...valeurs.canaux, canal]
    // Décocher « réseaux sociaux » retire les plateformes : garder Instagram coché pour quelqu'un
    // qui vient de dire qu'il n'y est pas serait une incohérence qu'on lui relirait ensuite.
    onChange({ canaux: choisis, plateformes: choisis.includes('reseaux') ? valeurs.plateformes : [] })
  }

  const basculerPlateforme = (plateforme: string) => {
    onChange({
      plateformes: valeurs.plateformes.includes(plateforme)
        ? valeurs.plateformes.filter((p) => p !== plateforme)
        : [...valeurs.plateformes, plateforme],
    })
  }

  return (
    <>
      {CANAUX.map((c) => (
        <label key={c.valeur} className="card row" style={{ gap: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={valeurs.canaux.includes(c.valeur)} onChange={() => basculer(c.valeur)} />
          <div>
            <div>{c.label}</div>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              {c.precisions}
            </div>
          </div>
        </label>
      ))}

      {valeurs.canaux.includes('reseaux') && (
        <div className="card">
          <div style={{ marginBottom: 4 }}>Sur lesquels publies-tu ?</div>
          <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
            L'assistant proposera du contenu pour ceux-là, et pas pour les autres.
          </div>
          {PLATEFORMES.map((p) => (
            <label key={p.valeur} className="row" style={{ gap: 10, cursor: 'pointer', margin: 0, fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={valeurs.plateformes.includes(p.valeur)}
                onChange={() => basculerPlateforme(p.valeur)}
              />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      )}
    </>
  )
}
