import { describe, expect, it } from 'vitest'
import {
  MESSAGE_NEUTRE,
  MOT_DE_PASSE_MIN,
  motDePasseInvalide,
  urlRetourReinitialisation,
} from './mot-de-passe-oublie'

describe('urlRetourReinitialisation', () => {
  it('construit l’adresse de retour depuis l’origine courante', () => {
    expect(urlRetourReinitialisation('https://artisan.braaise.io')).toBe(
      'https://artisan.braaise.io/nouveau-mot-de-passe',
    )
  })

  it('ne double jamais la barre oblique', () => {
    expect(urlRetourReinitialisation('https://artisan.braaise.io/')).toBe(
      'https://artisan.braaise.io/nouveau-mot-de-passe',
    )
    expect(urlRetourReinitialisation('  https://braise-ai.vercel.app  ')).toBe(
      'https://braise-ai.vercel.app/nouveau-mot-de-passe',
    )
  })

  it('retombe sur un chemin relatif si l’origine manque, plutôt que sur « undefined/… »', () => {
    expect(urlRetourReinitialisation('')).toBe('/nouveau-mot-de-passe')
    expect(urlRetourReinitialisation('   ')).toBe('/nouveau-mot-de-passe')
  })
})

describe('MESSAGE_NEUTRE', () => {
  it('ne dit jamais si l’adresse a un compte', () => {
    expect(MESSAGE_NEUTRE).toBe('Si cette adresse a un compte, le lien vient de partir.')
    // Les mots qui trahiraient une existence ou une absence de compte sont proscrits.
    expect(MESSAGE_NEUTRE.toLowerCase()).not.toMatch(/inconnu|n.existe pas|introuvable|déjà/)
  })
})

describe('la validation du mot de passe (celle de l’inscription)', () => {
  it('exige au moins 10 caractères', () => {
    expect(MOT_DE_PASSE_MIN).toBe(10)
    expect(motDePasseInvalide('Abc1')).toMatch(/au moins 10/)
  })

  it('exige une minuscule, une majuscule et un chiffre', () => {
    expect(motDePasseInvalide('motdepasse1')).toMatch(/majuscule/)
    expect(motDePasseInvalide('MOTDEPASSE1')).toMatch(/minuscule/)
    expect(motDePasseInvalide('MotDePasse')).toMatch(/chiffre/)
  })

  it('accepte un mot de passe conforme, et vérifie la confirmation', () => {
    expect(motDePasseInvalide('MotDePasse12')).toBeNull()
    expect(motDePasseInvalide('MotDePasse12', 'MotDePasse12')).toBeNull()
    expect(motDePasseInvalide('MotDePasse12', 'Autre12')).toMatch(/identiques/)
  })
})
