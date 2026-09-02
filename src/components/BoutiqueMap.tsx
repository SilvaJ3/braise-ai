import type { Boutique } from '../lib/supabase'

// Mini-carte gratuite via l'embed officiel OpenStreetMap (pas de clé, pas de facturation).
// Pour basculer sur Google Maps plus tard : remplacer `src` par une Google Maps Embed API
// (nécessite une clé + facturation) et `externalUrl` par un lien google.com/maps.
export default function BoutiqueMap({ boutique }: { boutique: Boutique }) {
  if (boutique.lat == null || boutique.lng == null) {
    return (
      <p className="muted" style={{ marginTop: 8 }}>
        📍 Pas encore localisée — renseigne l'adresse et clique « Localiser sur la carte » dans la
        fiche.
      </p>
    )
  }

  const d = 0.006 // ~600 m autour du point, assez pour situer une boutique en rue
  const bbox = [
    boutique.lng - d,
    boutique.lat - d,
    boutique.lng + d,
    boutique.lat + d,
  ].join('%2C')
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${boutique.lat}%2C${boutique.lng}`
  const externalUrl = `https://www.openstreetmap.org/?mlat=${boutique.lat}&mlon=${boutique.lng}#map=17/${boutique.lat}/${boutique.lng}`

  return (
    <div style={{ marginTop: 8 }}>
      <iframe
        title={`Carte — ${boutique.nom}`}
        src={src}
        loading="lazy"
        style={{
          width: '100%',
          height: 160,
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
        }}
      />
      <a
        className="muted"
        href={externalUrl}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: '0.8rem', display: 'inline-block', marginTop: 4 }}
      >
        Ouvrir en grand ↗
      </a>
    </div>
  )
}
