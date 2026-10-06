import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { systemEnBlocs } from './anthropic'
import {
  aUnSignal,
  CONSIGNES_BILAN,
  formaterAnomalies,
  noteIdee,
  refusIdee,
  SEUIL_BAS,
  SEUIL_HAUT,
  sansTiretCadratin,
  type LigneAnomalie,
} from './consignes-bilan'
import { NOMS_FORMULES } from './formules-accroche'

const BOL: LigneAnomalie = { designation: 'Bol Sable', ventes_30j: 12, mediane_mensuelle: 3, rapport: 4, signal: 'haut' }
const VASE: LigneAnomalie = { designation: 'Vase', ventes_30j: 0, mediane_mensuelle: 3, rapport: 0, signal: 'bas' }
// Un article à 1x sa médiane : ordinaire, aucune suggestion.
const TASSE: LigneAnomalie = { designation: 'Tasse Ordinaire', ventes_30j: 3, mediane_mensuelle: 3, rapport: 1, signal: 'ordinaire' }

describe('CONSIGNES_BILAN', () => {
  it('exige une formule nommée, un chiffre issu des ventes et couvre signal haut et bas', () => {
    expect(CONSIGNES_BILAN).toMatch(/nomme-la exactement/)
    expect(CONSIGNES_BILAN).toMatch(/au moins un chiffre/)
    expect(CONSIGNES_BILAN).toMatch(/signal haut/)
    expect(CONSIGNES_BILAN).toMatch(/signal bas/)
    for (const nom of NOMS_FORMULES) expect(CONSIGNES_BILAN).toContain(nom)
  })

  it('garde ce qui marchait : 4 idées, observations de planning, anti-répétition', () => {
    expect(CONSIGNES_BILAN).toMatch(/4 idées/)
    expect(CONSIGNES_BILAN).toMatch(/observations utiles sur son planning/)
    expect(CONSIGNES_BILAN).toMatch(/INTERDIT ABSOLU/)
    expect(CONSIGNES_BILAN).toMatch(/rendre_bilan/)
  })

  it('impose le filtre anti-« français d’IA » sans en donner l’exemple', () => {
    expect(CONSIGNES_BILAN).toMatch(/tiret cadratin/)
    expect(CONSIGNES_BILAN).toMatch(/il ne s'agit pas de X mais de Y/)
    expect(CONSIGNES_BILAN).toMatch(/triptyque/)
    expect(CONSIGNES_BILAN).not.toMatch(/[—–]/)
  })

  it('reste le PREMIER bloc, seul à porter le cache, sans rien de propre à un compte', () => {
    const blocs = systemEnBlocs([CONSIGNES_BILAN], ['contexte du compte', formaterAnomalies([BOL])])
    expect(blocs[0].text).toBe(CONSIGNES_BILAN)
    expect(blocs[0]).toHaveProperty('cache_control')
    expect(blocs.slice(1).every((b) => !('cache_control' in b))).toBe(true)
    expect(CONSIGNES_BILAN).not.toMatch(/Bol Sable/)
  })

  it('porte les mêmes seuils que la migration 0089', () => {
    const sql = readFileSync(new URL('../../migrations/20261006130000_0089_anomalie_ventes.sql', import.meta.url), 'utf8')
    expect(sql).toContain(`/ b.mediane_mensuelle > ${SEUIL_HAUT} then 'haut'`)
    expect(sql).toContain(`/ b.mediane_mensuelle < ${SEUIL_BAS} then 'bas'`)
  })
})

describe('formaterAnomalies : un article ordinaire ne produit aucune suggestion', () => {
  it('ne cite pas un article à 1x sa médiane, même au milieu de vrais signaux', () => {
    const bloc = formaterAnomalies([BOL, TASSE, VASE])
    expect(bloc).toContain('Bol Sable')
    expect(bloc).toContain('Vase')
    expect(bloc).not.toContain('Tasse Ordinaire')
  })

  it('dit « aucun article ne sort de l’ordinaire » quand il ne reste que des articles ordinaires', () => {
    const bloc = formaterAnomalies([TASSE])
    expect(bloc).not.toContain('Tasse Ordinaire')
    expect(bloc).toMatch(/aucun article ne sort de l'ordinaire/)
    expect(aUnSignal([TASSE])).toBe(false)
  })

  it('ne chiffre rien sur un historique mince ni sans vente', () => {
    const mince = formaterAnomalies([{ ...BOL, signal: 'insuffisant' }])
    expect(mince).toMatch(/trop mince/)
    expect(mince).not.toContain('Bol Sable')
    expect(aUnSignal([{ ...BOL, signal: 'insuffisant' }])).toBe(false)
    expect(formaterAnomalies([])).toMatch(/aucune vente/)
  })

  it('cite les deux sens : décollé et décroché', () => {
    const bloc = formaterAnomalies([BOL, VASE])
    expect(bloc).toMatch(/Signal haut[\s\S]*Bol Sable : 12 vendus[\s\S]*rapport 4/)
    expect(bloc).toMatch(/Signal bas[\s\S]*Vase : 0 vendus/)
    expect(aUnSignal([BOL, TASSE])).toBe(true)
  })
})

describe('refusIdee : la sortie du bilan contient une formule nommée ET un chiffre', () => {
  const bonne = {
    title: 'Le bol Sable, 12 ventes',
    formule: 'Le reçu',
    a_dire: "J'ai vendu 12 bols en octobre. Sur ces 12, la moitié est partie par deux.",
    ecran: '12 BOLS. 6 PAR DEUX.',
  }

  it('accepte une idée avec formule du catalogue et chiffre', () => {
    expect(refusIdee(bonne, true)).toBeNull()
  })

  it('la note enregistrée au planning porte le nom de la formule ET le chiffre', () => {
    const note = noteIdee(bonne)
    expect(note).toContain('Formule : Le reçu')
    expect(note).toMatch(/\d/)
    expect(note).toContain('En écran : 12 BOLS. 6 PAR DEUX.')
  })

  it('refuse une formule absente ou inventée', () => {
    expect(refusIdee({ ...bonne, formule: undefined }, true)).toMatch(/formule/)
    expect(refusIdee({ ...bonne, formule: 'Cold Open Demo' }, true)).toMatch(/formule/)
  })

  it('refuse l’absence de chiffre quand les ventes en donnaient, l’accepte sinon', () => {
    const sansChiffre = { ...bonne, a_dire: 'Ce bol a très bien marché ce mois-ci.' }
    expect(refusIdee(sansChiffre, true)).toMatch(/chiffre/)
    expect(refusIdee(sansChiffre, false)).toBeNull()
  })

  it('refuse une accroche d’écran de plus de 6 mots et la tournure « il ne s’agit pas de »', () => {
    expect(refusIdee({ ...bonne, ecran: 'UN DEUX TROIS QUATRE CINQ SIX SEPT' }, true)).toMatch(/6 mots/)
    expect(refusIdee({ ...bonne, a_dire: "Il ne s'agit pas de 12 bols mais d'un geste." }, true)).toMatch(/il ne s'agit pas/)
  })

  it('retire les tirets cadratins du texte stocké', () => {
    expect(sansTiretCadratin('12 bols — dont 6 en lot')).toBe('12 bols, dont 6 en lot')
    expect(noteIdee({ ...bonne, a_dire: 'Un bol – 12 ventes' })).not.toMatch(/[—–]/)
  })
})
