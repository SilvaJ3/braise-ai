// Ce que le mail d'accueil affirme, et ce qu'il ne doit JAMAIS affirmer.
//
// Les phrases de produit se dérèglent en silence : un chiffre écrit à la main qui cesse de
// correspondre à l'enveloppe réelle, un prix qui s'invite dans un mail d'accueil, un mot genré.
// Ce fichier tient ces garde-fous-là, sans réseau ni envoi.
import { describe, expect, it } from 'vitest'
import { enveloppeJetons, questionsIndicatives } from './enveloppe'
import { accueilArme, construireMailAccueil, NOM_MODELE, OBJET_ACCUEIL } from './mail-accueil'

const APP = 'https://artisan.braaise.io'

describe('mail d’accueil', () => {
  it('porte le lien de l’app, le nom du fichier joint et l’objet prévu', () => {
    const m = construireMailAccueil({ appUrl: APP, plan: 'mensuel' })
    expect(m.subject).toBe(OBJET_ACCUEIL)
    expect(m.text).toContain(APP)
    expect(m.text).toContain(NOM_MODELE)
    expect(m.html).toContain(APP)
  })

  it('tolère une URL avec barre finale sans fabriquer de double barre', () => {
    const m = construireMailAccueil({ appUrl: `${APP}/`, plan: 'mensuel' })
    expect(m.text).toContain(APP)
    expect(m.text).not.toContain(`${APP}//`)
    expect(m.html).not.toContain(`${APP}//`)
  })

  it('annonce l’enveloppe du PLAN, pas un chiffre écrit à la main', () => {
    const essai = construireMailAccueil({ appUrl: APP, plan: 'essai' }).text
    const mensuel = construireMailAccueil({ appUrl: APP, plan: 'mensuel' }).text
    const nEssai = questionsIndicatives(enveloppeJetons('essai'))
    const nMensuel = questionsIndicatives(enveloppeJetons('mensuel'))
    // Depuis le 02/10 (essai avec carte) l'essai a la même enveloppe que le mensuel : on ne les exige plus différentes,
    // seulement que chaque mail annonce le chiffre de SON plan, lu dans `enveloppe.ts`.
    expect(essai).toContain(`${nEssai} questions`)
    expect(mensuel).toContain(`${nMensuel} questions`)
    expect(essai).toContain('essai')
    // Un compte en essai n'a pas d'abonnement : ne pas lui parler de packs.
    expect(essai).not.toContain('pack de calcul')
    expect(mensuel).toContain('pack de calcul')
  })

  it('le réglage d’armement n’accepte QUE « oui »', () => {
    expect(accueilArme('oui')).toBe(true)
    expect(accueilArme(' oui ')).toBe(true)
    expect(accueilArme('OUI')).toBe(true)
    for (const v of ['non', '', null, undefined, 'oui mais', 1, true, 'true']) {
      expect(accueilArme(v), `valeur ${String(v)}`).toBe(false)
    }
  })

  it('n’engage aucun prix', () => {
    for (const plan of ['essai', 'mensuel', 'fondateur', 'annuel']) {
      const m = construireMailAccueil({ appUrl: APP, plan })
      expect(m.text).not.toMatch(/€|\d+\s*euros|\/\s*mois|\/\s*an/i)
      expect(m.html).not.toMatch(/€|\d+\s*euros/i)
    }
  })

  it('dit les limites du produit', () => {
    const m = construireMailAccueil({ appUrl: APP, plan: 'mensuel' })
    for (const t of [m.text, m.html]) {
      expect(t).toMatch(/ni facture, ni comptabilité/i)
    }
  })

  it('n’écrit jamais « artisane », et ne parle pas du chantier', () => {
    const m = construireMailAccueil({ appUrl: APP, plan: 'mensuel' })
    expect(m.text).not.toMatch(/artisan(e|es)\b/)
    expect(m.html).not.toMatch(/artisan(e|es)\b/)
    expect(m.text).not.toMatch(/pas encore|bientôt|en cours de développement|roadmap/i)
  })

  it('produit une version HTML sans gabarit vide et un brut non vide', () => {
    const m = construireMailAccueil({ appUrl: APP, plan: 'mensuel' })
    expect(m.html).toMatch(/^<!DOCTYPE html>/i)
    expect(m.html.length).toBeGreaterThan(1500)
    expect(m.text.length).toBeGreaterThan(800)
    // Sans URL, pas de bouton mort : le mail part quand même, sans CTA.
    const sans = construireMailAccueil({ appUrl: '', plan: 'mensuel' })
    expect(sans.html).not.toContain('Ouvrir Braaise')
  })
})
