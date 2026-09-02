// Géocodage gratuit via Nominatim (OpenStreetMap) — pas de clé, pas de facturation.
// Déclenché uniquement sur clic explicite (bouton "Localiser"), jamais en auto, pour
// rester dans l'usage raisonnable toléré par Nominatim (nominatim.org/release-docs/latest/api/Search/).
// À remplacer par l'API Geocoding Google Maps si on bascule sur cette intégration.
export async function geocodeAdresse(
  adresse: string,
): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(adresse)}`
  const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } })
  if (!res.ok) return null
  const data = (await res.json()) as Array<{ lat: string; lon: string }>
  if (!data[0]) return null
  const lat = Number(data[0].lat)
  const lng = Number(data[0].lon)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}
