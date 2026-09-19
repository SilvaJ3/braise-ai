import { describe, expect, it } from 'vitest'
import {
  champTexte,
  dateLisible,
  destinatairesAdmin,
  emailDemandeInvalide,
  jeton,
  mailInvitation,
  mailNotification,
  normaliserEmailDemande,
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

describe('destinatairesAdmin', () => {
  it('accepte une adresse seule', () => {
    expect(destinatairesAdmin('contact@braaise.io')).toEqual(['contact@braaise.io'])
  })

  it('accepte plusieurs adresses, quel que soit le séparateur et la casse', () => {
    expect(destinatairesAdmin(' Contact@Braaise.io , junior@Exemple.be ')).toEqual([
      'contact@braaise.io',
      'junior@exemple.be',
    ])
    expect(destinatairesAdmin('a@b.be;c@d.be')).toEqual(['a@b.be', 'c@d.be'])
  })

  it('écarte les doublons et ce qui n’est pas une adresse', () => {
    expect(destinatairesAdmin('a@b.be, A@B.be, pas-une-adresse, ,')).toEqual(['a@b.be'])
  })

  it('rend une liste vide plutôt qu’une adresse inventée', () => {
    expect(destinatairesAdmin('')).toEqual([])
    expect(destinatairesAdmin('n’importe quoi')).toEqual([])
  })
})

/** Ce qui a été retiré d'ici : les pages HTML. Une edge function Supabase ne peut pas servir de
 *  HTML (la passerelle impose `text/plain` + un CSP `sandbox`, le navigateur montre la source).
 *  La page vit sur le site ; la fonction ne rend que du JSON — voir `VueDemande`. */

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

/* Les tests des pages HTML ont été retirés avec elles : la fonction ne rend plus que du JSON, et
   c'est le site qui affiche. Ces textes se vérifient désormais dans le composant du site. */
