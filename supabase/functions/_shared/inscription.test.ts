import { describe, expect, it } from 'vitest'
import {
  codeInvalide,
  emailInvalide,
  erreurFormulaire,
  MESSAGES,
  MOT_DE_PASSE_MIN,
  motDePasseInvalide,
  normaliserCode,
  normaliserEmail,
} from './inscription'

describe('normaliserCode', () => {
  it('accepte un code dicté : minuscules, espaces, sans tirets', () => {
    expect(normaliserCode(' 7k2m 9qx4 abcd ')).toBe('7K2M9QX4ABCD')
    expect(normaliserCode('7K2M-9QX4-ABCD')).toBe('7K2M-9QX4-ABCD')
    expect(normaliserCode('7k2m-9qx4-abcd')).toBe('7K2M-9QX4-ABCD')
  })

  it('rend une chaîne vide plutôt que de planter sur autre chose qu\'un texte', () => {
    expect(normaliserCode(undefined)).toBe('')
    expect(normaliserCode(null)).toBe('')
    expect(normaliserCode(42)).toBe('')
  })
})

describe('normaliserEmail', () => {
  it('supprime les espaces et la casse', () => {
    expect(normaliserEmail('  Junior@Example.COM ')).toBe('junior@example.com')
  })
})

describe('emailInvalide', () => {
  it('accepte une adresse ordinaire', () => {
    expect(emailInvalide('alexandra.mnier@gmail.com')).toBeNull()
    expect(emailInvalide('contact+braaise@atelier.be')).toBeNull()
  })

  it('refuse vide, sans arobase, sans domaine, ou trop long', () => {
    expect(emailInvalide('')).toMatch(/Indique/)
    expect(emailInvalide('junior.example.com')).toMatch(/valide/)
    expect(emailInvalide('junior@example')).toMatch(/valide/)
    expect(emailInvalide('junior@example.')).toMatch(/valide/)
    expect(emailInvalide(`${'a'.repeat(250)}@example.com`)).toMatch(/trop longue/)
  })
})

describe('motDePasseInvalide', () => {
  it('accepte un mot de passe qui couvre la politique du service', () => {
    expect(motDePasseInvalide('Bougies-2026-Namur')).toBeNull()
  })

  it('refuse vide, trop court et trop long', () => {
    expect(motDePasseInvalide('')).toMatch(/Choisis/)
    expect(motDePasseInvalide('Court1')).toMatch(new RegExp(String(MOT_DE_PASSE_MIN)))
    expect(motDePasseInvalide(`Aa1${'a'.repeat(80)}`)).toMatch(/72/)
  })

  // Relevé en interrogeant GoTrue : le projet exige une minuscule, une majuscule et un chiffre.
  // Sans ce contrôle, l'utilisatrice reçoit « Password should contain at least one character… ».
  it('exige une minuscule, une majuscule et un chiffre', () => {
    expect(motDePasseInvalide('bougies-2026-namur')).toMatch(/une majuscule/)
    expect(motDePasseInvalide('BOUGIES-2026-NAMUR')).toMatch(/une minuscule/)
    expect(motDePasseInvalide('Bougies-Namur')).toMatch(/un chiffre/)
    expect(motDePasseInvalide('bougies2026')).toMatch(/une majuscule/)
  })

  it('énumère les manques au pluriel quand il y en a plusieurs', () => {
    expect(motDePasseInvalide('bougies-namur')).toMatch(/une majuscule et un chiffre/)
  })

  it('refuse deux saisies différentes', () => {
    expect(motDePasseInvalide('Bougies-2026-Namur', 'Bougies-2026-Namurs')).toMatch(/identiques/)
    expect(motDePasseInvalide('Bougies-2026-Namur', 'Bougies-2026-Namur')).toBeNull()
  })
})

describe('codeInvalide', () => {
  it('accepte un code à tirets comme sans', () => {
    expect(codeInvalide('7K2M-9QX4-ABCD')).toBeNull()
    expect(codeInvalide('7K2M9QX4ABCD')).toBeNull()
  })

  it('refuse vide, trop court, ou caractères inattendus', () => {
    expect(codeInvalide('')).toMatch(/Indique/)
    expect(codeInvalide('ABC')).toMatch(/complet/)
    expect(codeInvalide('7K2M_9QX4')).toMatch(/lettres et des chiffres/)
    expect(codeInvalide(`X${'A'.repeat(70)}`)).toMatch(/complet/)
  })
})

describe('erreurFormulaire', () => {
  it('ne rend rien quand tout est bon', () => {
    expect(
      erreurFormulaire({
        code: '7K2M-9QX4-ABCD',
        email: 'fondateur@example.com',
        motDePasse: 'Bougies-2026-Namur',
        confirmation: 'Bougies-2026-Namur',
      }),
    ).toBeNull()
  })

  it('signale le premier champ fautif, dans l\'ordre du formulaire', () => {
    expect(erreurFormulaire({ code: '', email: '', motDePasse: '' })).toMatch(/code d'invitation/)
    expect(erreurFormulaire({ code: '7K2M-9QX4-ABCD', email: 'nope', motDePasse: 'Bougies-2026' })).toMatch(/email/)
    expect(
      erreurFormulaire({
        code: '7K2M-9QX4-ABCD',
        email: 'fondateur@example.com',
        motDePasse: 'Court1',
      }),
    ).toMatch(/au moins/)
  })
})

describe('MESSAGES', () => {
  it('dit toujours quoi faire ensuite, jamais un code d\'erreur nu', () => {
    for (const [cle, message] of Object.entries(MESSAGES)) {
      expect(message.length, `message ${cle}`).toBeGreaterThan(40)
      expect(message).not.toMatch(/error|undefined|null/i)
    }
  })
})
