import { CANAL_LABEL } from '../lib/labels'
import type { Boutique } from '../lib/supabase'
import BoutiqueMap from './BoutiqueMap'

// ponytail: onglet "Contacts" (log manuel) retiré de l'UI pour l'instant — peu
// d'intérêt à l'usage réel. Table + hooks (useBoutiqueContacts, useLogContact,
// useDeleteContact dans lib/boutiques.ts) restent en place, faciles à rebrancher.
export default function BoutiqueDetail({ boutique }: { boutique: Boutique }) {
  const rows: { label: string; value: string }[] = []
  if (boutique.canal_prefere) rows.push({ label: 'Canal préféré', value: CANAL_LABEL[boutique.canal_prefere] })
  if (boutique.email) rows.push({ label: 'Email', value: boutique.email })
  if (boutique.telephone) rows.push({ label: 'Téléphone', value: boutique.telephone })
  if (boutique.horaires?.note) rows.push({ label: 'Horaires', value: boutique.horaires.note })
  if (boutique.notes) rows.push({ label: 'Notes', value: boutique.notes })

  return (
    <div className="card stack">
      {rows.length === 0 ? (
        <p className="empty">Aucune coordonnée renseignée.</p>
      ) : (
        rows.map((r) => (
          <div key={r.label}>
            <span className="muted">{r.label}</span>
            <p style={{ margin: '2px 0 0' }}>{r.value}</p>
          </div>
        ))
      )}

      <BoutiqueMap boutique={boutique} />
    </div>
  )
}
