import { describe, expect, it } from 'vitest'
import {
  emailBody,
  emailSubject,
  fmtDateCourte,
  fmtDateLongue,
  fmtEuro,
  fmtQte,
  isEmail,
  nbArticles,
  numeroSuivant,
  parseEmails,
  pdfFilename,
  problemesEnvoi,
  totalDoc,
  totalLigne,
  type DepotDoc,
} from './depot-doc'

const emetteur = {
  nom: 'Au Coin du Feu',
  adresse: 'Rue Cardinale Lavigerie 7, 1040 Etterbeek',
  telephone: '0471469685',
  tva: 'BE0797472335',
  email: 'contact@example.be',
  mention_signature: 'EN SIGNANT, J’ACCEPTE LES CONDITIONS GÉNÉRALES.',
}

const doc = (over: Partial<DepotDoc> = {}): DepotDoc => ({
  numero: '2026-001',
  date_depot: '2026-09-03',
  emetteur,
  boutique_nom: 'La Petite Boutique',
  boutique_adresse: 'Rue Dansaert 12, 1000 Bruxelles',
  boutique_email: 'contact@laboutique.be',
  lignes: [
    { designation: 'Grande bougie', quantite: 3, prix_unitaire: 35 },
    { designation: 'Suspension parfumée', quantite: 10, prix_unitaire: 6 },
  ],
  notes: null,
  signataire_nom: 'Marie Dupont',
  signature_image: 'AAAA',
  ...over,
})

describe('formatage', () => {
  it('dates', () => {
    expect(fmtDateLongue('2026-09-03')).toBe('3 septembre 2026')
    expect(fmtDateLongue('2026-08-01')).toBe('1 août 2026')
    expect(fmtDateCourte('2026-09-03')).toBe('03/09/2026')
    expect(fmtDateLongue('n’importe quoi')).toBe('n’importe quoi')
  })
  it('euros à la belge', () => {
    expect(fmtEuro(40)).toBe('40 €')
    expect(fmtEuro(12.5)).toBe('12,50 €')
    expect(fmtEuro(0)).toBe('0 €')
    expect(fmtEuro(1.005)).toBe('1,01 €')
  })
  it('quantités sans décimale inutile', () => {
    expect(fmtQte(3)).toBe('3')
    expect(fmtQte(2.5)).toBe('2,5')
    expect(fmtQte(2.25)).toBe('2,25')
  })
})

describe('totaux', () => {
  it('ligne et document', () => {
    expect(totalLigne({ designation: 'x', quantite: 3, prix_unitaire: 35 })).toBe(105)
    expect(totalDoc(doc().lignes)).toBe(165)
    expect(nbArticles(doc().lignes)).toBe(13)
  })
  it('pas de dérive flottante', () => {
    expect(totalDoc([{ designation: 'x', quantite: 3, prix_unitaire: 0.1 }])).toBe(0.3)
  })
})

describe('numérotation et nom de fichier', () => {
  it('numéro séquentiel par année', () => {
    expect(numeroSuivant(2026, 0)).toBe('2026-001')
    expect(numeroSuivant(2026, 12)).toBe('2026-013')
    expect(numeroSuivant(2026, 999)).toBe('2026-1000')
  })
  it('nom de fichier assaini', () => {
    expect(pdfFilename({ numero: '2026-001', date_depot: '2026-09-03' })).toBe('bon-depot-2026-001.pdf')
    expect(pdfFilename({ numero: null, date_depot: '2026-09-03' })).toBe('bon-depot-2026-09-03.pdf')
    expect(pdfFilename({ numero: 'A/B 3', date_depot: 'x' })).toBe('bon-depot-A-B-3.pdf')
  })
})

describe('adresses mail', () => {
  it('valide les formes courantes', () => {
    expect(isEmail('a@b.be')).toBe(true)
    expect(isEmail('prenom.nom+tag@sous.domaine.com')).toBe(true)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('pas une adresse')).toBe(false)
  })
  it('découpe une saisie libre, dédoublonne, sépare les invalides', () => {
    const r = parseEmails('a@b.be, c@d.be;  A@B.BE   pasbon@ , e@f.be')
    expect(r.valid).toEqual(['a@b.be', 'c@d.be', 'e@f.be'])
    expect(r.invalid).toEqual(['pasbon@'])
  })
})

describe('mail', () => {
  it('objet avec numéro et date', () => {
    expect(emailSubject(doc())).toBe('Bon de dépôt n° 2026-001 — Au Coin du Feu — 03/09/2026')
  })
  it('corps : articles, total, coordonnées', () => {
    const b = emailBody(doc({ notes: 'Livré en main propre.' }))
    expect(b).toContain('La Petite Boutique')
    expect(b).toContain('• Grande bougie — 3 × 35 €')
    expect(b).toContain('Total (prix de vente TTC) : 165 €')
    expect(b).toContain('Note : Livré en main propre.')
    expect(b).toContain('Au Coin du Feu')
  })
})

describe('problemesEnvoi', () => {
  it('accepte un bon complet', () => {
    expect(problemesEnvoi(doc(), ['contact@laboutique.be'])).toEqual([])
  })
  it('signale chaque manque', () => {
    const p = problemesEnvoi(
      doc({ lignes: [], signature_image: null, emetteur: { ...emetteur, nom: '' } }),
      [],
    )
    expect(p).toHaveLength(4)
    expect(p.join(' ')).toMatch(/entreprise/)
    expect(p.join(' ')).toMatch(/article/)
    expect(p.join(' ')).toMatch(/signature/)
    expect(p.join(' ')).toMatch(/destinataire/)
  })
  it('refuse une quantité nulle et une adresse invalide', () => {
    const p = problemesEnvoi(
      doc({ lignes: [{ designation: 'x', quantite: 0, prix_unitaire: 5 }] }),
      ['pasbon'],
    )
    expect(p.join(' ')).toMatch(/quantité/i)
    expect(p.join(' ')).toMatch(/invalide/)
  })
})
