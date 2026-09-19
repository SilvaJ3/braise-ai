import { describe, expect, it } from 'vitest'
import {
  champTexte,
  dateLisible,
  echapperHtml,
  emailDemandeInvalide,
  jeton,
  mailInvitation,
  mailNotification,
  normaliserEmailDemande,
  pageSuite,
  pageValidation,
} from './demande-acces.ts'

describe('champTexte', () => {
  it('nettoie les espaces et ramène tout sur une ligne', () => {
    expect(champTexte('  Atelier\n\tdu  Coin  ', 120)).toBe('Atelier du Coin')
  })

  it('borne la longueur', () => {
    expect(champTexte('a'.repeat(300), 120)?.length).toBe(120)
  })

  it('rend null pour un champ vide ou d’un autre type', () => {
    expect(champTexte('   ', 120)).toBeNull()
    expect(champTexte(undefined, 120)).toBeNull()
    expect(champTexte(42, 120)).toBeNull()
  })
})

describe('normaliserEmailDemande', () => {
  it('met en minuscules et retire les espaces', () => {
    expect(normaliserEmailDemande('  Marie@Atelier.BE ')).toBe('marie@atelier.be')
  })
})

describe('emailDemandeInvalide', () => {
  it('accepte les adresses ordinaires', () => {
    expect(emailDemandeInvalide('marie@atelier.be')).toBeNull()
    expect(emailDemandeInvalide('marie+braise@atelier.co.uk')).toBeNull()
  })

  it('refuse ce qui ne peut pas être une adresse', () => {
    expect(emailDemandeInvalide('')).toMatch(/email/)
    expect(emailDemandeInvalide('marie.atelier.be')).toMatch(/email/)
    expect(emailDemandeInvalide('marie@atelier')).toMatch(/email/)
    expect(emailDemandeInvalide('marie @atelier.be')).toMatch(/email/)
    expect(emailDemandeInvalide(`${'a'.repeat(250)}@atelier.be`)).toMatch(/email/)
  })
})

describe('jeton', () => {
  it('fait 32 caractères hexadécimaux, et ne se répète pas', () => {
    const a = jeton()
    const b = jeton()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toBe(b)
  })
})

describe('echapperHtml', () => {
  it('neutralise ce qui pourrait sortir de son cadre', () => {
    expect(echapperHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    )
    expect(echapperHtml("Atelier d'Angèle & Cie")).toBe('Atelier d&#39;Angèle &amp; Cie')
  })
})

describe('dateLisible', () => {
  it('rend une date en français, heure de Bruxelles', () => {
    const d = dateLisible('2026-09-19T09:30:00.000Z')
    expect(d).toContain('2026')
    expect(d).toContain('11:30')
  })
})

describe('mailNotification', () => {
  const base = {
    email: 'marie@atelier.be',
    atelier: 'Atelier du Coin',
    message: 'Je vends en trois boutiques.',
    lien: 'https://exemple.supabase.co/functions/v1/demande-acces?t=abc',
    recueLe: '19 septembre 2026 à 11:30',
    ip: '203.0.113.7',
  }

  it('porte le lien de validation, le contexte et dit que rien n’est encore parti', () => {
    const m = mailNotification({ ...base, dejaCompte: false })
    expect(m.subject).toBe("[Braaise] Demande d'accès — marie@atelier.be")
    expect(m.text).toContain(base.lien)
    expect(m.text).toContain('Atelier du Coin')
    expect(m.text).toContain('Je vends en trois boutiques.')
    expect(m.text).toContain("rien ne part avant que tu cliques")
    // La version mise en page porte le même lien, en bouton.
    expect(m.mise.cta?.url).toBe(base.lien)
    expect(m.mise.cta?.libelle).toBe('Ouvrir la demande')
    expect(m.mise.encadre?.lignes.map(([c]) => c)).toEqual([
      'Email',
      'Atelier',
      'Message',
      'Reçue le',
    ])
  })

  it('remplace le lien par un conseil quand l’adresse a déjà un compte', () => {
    const m = mailNotification({ ...base, dejaCompte: true })
    expect(m.text).toContain('a déjà un compte')
    expect(m.text).not.toContain(base.lien)
    // Pas de bouton : il n'y a rien à valider.
    expect(m.mise.cta).toBeUndefined()
    expect(m.mise.note).toContain('marie@atelier.be')
  })
})

describe('mailInvitation', () => {
  it('donne le lien, le code et la durée de validité', () => {
    const m = mailInvitation({
      email: 'marie@atelier.be',
      code: 'ABCD-EFGH-JKLM',
      lien: 'https://braise-ai.vercel.app/inscription?code=ABCD-EFGH-JKLM&email=marie%40atelier.be',
      validiteJours: 30,
    })
    expect(m.subject).toBe('Ton invitation à Braaise')
    expect(m.text).toContain('ABCD-EFGH-JKLM&email=marie%40atelier.be')
    expect(m.text).toContain('30 jours')
    expect(m.text).toContain('mot de passe')
  })
})

describe('pageValidation', () => {
  const base = {
    email: 'marie@atelier.be',
    atelier: 'Atelier du Coin',
    message: 'Bonjour',
    jeton: 'a'.repeat(32),
    recueLe: '19 septembre 2026 à 11:30',
  }

  it('propose les deux gestes, sans agir elle-même', () => {
    const p = pageValidation(base)
    expect(p.statut).toBe(200)
    expect(p.html).toContain('name="action" value="valider"')
    expect(p.html).toContain('name="action" value="refuser"')
    expect(p.html).toContain('method="post"')
    expect(p.html).toContain("Rien n'est envoyé tant que tu n'as pas cliqué.")
  })

  it('échappe ce qui vient du demandeur', () => {
    const p = pageValidation({ ...base, message: '<img src=x onerror=alert(1)>' })
    expect(p.html).not.toContain('<img src=x')
    expect(p.html).toContain('&lt;img src=x')
  })

  it('avertit sans décider quand un compte existe déjà', () => {
    const p = pageValidation({ ...base, dejaCompte: true })
    expect(p.html).toContain('a déjà un compte Braaise')
    // Le bouton reste : c'est l'administrateur qui juge.
    expect(p.html).toContain('name="action" value="valider"')
  })
})

describe('pageSuite', () => {
  it('annonce l’invitation et le code créé', () => {
    const p = pageSuite({ cas: 'validee', email: 'marie@atelier.be', code: 'ABCD-EFGH-JKLM' })
    expect(p.statut).toBe(200)
    expect(p.html).toContain('Invitation envoyée')
    expect(p.html).toContain('ABCD-EFGH-JKLM')
  })

  it('dit clairement qu’un refus n’envoie rien', () => {
    const p = pageSuite({ cas: 'refusee', email: 'marie@atelier.be' })
    expect(p.html).toContain("Rien n'a été envoyé")
  })

  it('ne propose rien pour un jeton déjà servi', () => {
    const p = pageSuite({ cas: 'deja_traitee' })
    expect(p.html).toContain('Déjà traité')
    expect(p.html).not.toContain('name="action"')
  })

  it('marque l’erreur en 500, sans faire croire à un envoi', () => {
    const p = pageSuite({ cas: 'erreur' })
    expect(p.statut).toBe(500)
    expect(p.html).toContain("rien n'a été envoyé")
  })
})
