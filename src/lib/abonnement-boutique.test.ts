import { describe, expect, it } from 'vitest'
import {
  etatAbonnementBoutique,
  lireAbonnementBoutique,
  messageRetourPaiementBoutique,
  paiementBoutiqueOuvert,
  phraseAbonnerPendantOffert,
  statutBoutique,
} from './abonnement-boutique'

const M = new Date('2026-10-20T10:00:00.000Z')

describe('statutBoutique', () => {
  it('garde les cinq statuts, le reste compte pour « aucun »', () => {
    for (const s of ['aucun', 'offert', 'actif', 'en_retard', 'resilie'] as const) expect(statutBoutique(s)).toBe(s)
    for (const v of [undefined, null, '', 'trialing', 42]) expect(statutBoutique(v)).toBe('aucun')
  })
})

describe('les boutons de paiement', () => {
  it('l’interrupteur n’est allumé que par la valeur « oui » : éteint par défaut et en cas de doute', () => {
    expect(paiementBoutiqueOuvert('oui')).toBe(true)
    for (const v of [undefined, null, '', 'non', 'true', 'OUI', 1, true]) expect(paiementBoutiqueOuvert(v)).toBe(false)
  })

  it('dit une phrase au retour de la page de paiement, et rien pour une valeur inconnue', () => {
    expect(messageRetourPaiementBoutique('ok')?.texte).toMatch(/Paiement reçu/)
    expect(messageRetourPaiementBoutique('offert')?.texte).toMatch(/jours offerts sont gardés/)
    expect(messageRetourPaiementBoutique('annule')).toEqual({ ton: 'info', texte: 'Paiement annulé : rien n’a été prélevé.' })
    for (const v of ['', 'pack', 'x', null, undefined]) expect(messageRetourPaiementBoutique(v)).toBeNull()
  })

  it('s’abonner pendant l’accès offert : jours gardés si l’accès dure encore, sinon départ immédiat annoncé', () => {
    const long = phraseAbonnerPendantOffert({ statut: 'offert', acces_offert_jusqu_au: '2027-01-20' }, M)
    expect(long).toContain('tu gardes tes jours offerts')
    expect(long).toContain('20 janvier 2027')
    const court = phraseAbonnerPendantOffert({ statut: 'offert', acces_offert_jusqu_au: '2026-10-21' }, M)
    expect(court).toContain('démarre tout de suite')
    expect(court).not.toContain('tu gardes')
  })

  it('aucune phrase pour un accès déjà terminé ou un autre statut', () => {
    expect(phraseAbonnerPendantOffert({ statut: 'offert', acces_offert_jusqu_au: '2026-10-01' }, M)).toBeNull()
    expect(phraseAbonnerPendantOffert({ statut: 'actif', fin: '2027-01-20' }, M)).toBeNull()
    expect(phraseAbonnerPendantOffert(null, M)).toBeNull()
  })
})

describe('lireAbonnementBoutique', () => {
  it('une réponse d’erreur ou illisible n’est pas un abonnement', () => {
    for (const brut of [null, undefined, 'x', 3, {}, { erreur: 'non_connecte' }, { erreur: 'pas_un_compte_boutique' }, { ok: false }]) {
      expect(lireAbonnementBoutique(brut)).toBeNull()
    }
  })

  it('lit ce que rend la base et ignore le reste (prix, fréquence)', () => {
    const l = lireAbonnementBoutique({
      ok: true, statut: 'offert', acces_offert: true, acces_offert_jusqu_au: '2027-01-20', prix_centimes: null, frequence: null, fin: null, annule: false,
    })
    expect(l).toEqual({ statut: 'offert', acces_offert_jusqu_au: '2027-01-20', fin: null, annule: false })
  })

  it('des dates de mauvais type deviennent null', () => {
    expect(lireAbonnementBoutique({ ok: true, statut: 'actif', fin: 12, acces_offert_jusqu_au: {} })).toMatchObject({ fin: null, acces_offert_jusqu_au: null })
  })
})

describe('etatAbonnementBoutique', () => {
  it('sans ligne : aucun abonnement, le lien reste dit fonctionnel', () => {
    const e = etatAbonnementBoutique(null, M)
    expect(e.statut).toBe('aucun')
    expect(e.phrase).toMatch(/lien de boutique fonctionne/)
    expect(e.accesCompte).toBe(false)
    expect(e.peutSouscrire).toBe(true)
  })

  it('accès offert en cours : date écrite, rien prélevé, le jour même compte encore', () => {
    for (const jusqua of ['2027-01-20', '2026-10-20']) {
      const e = etatAbonnementBoutique({ statut: 'offert', acces_offert_jusqu_au: jusqua }, M)
      expect(e.badge).toBe('Accès offert')
      expect(e.phrase).toMatch(/Rien n’est prélevé sans ton accord/)
      expect(e.accesCompte).toBe(true)
      expect(e.peutGerer).toBe(false)
    }
  })

  it('accès offert terminé : le compte se ferme, jamais le lien', () => {
    const e = etatAbonnementBoutique({ statut: 'offert', acces_offert_jusqu_au: '2026-10-19' }, M)
    expect(e.badge).toBe('Accès offert terminé')
    expect(e.accesCompte).toBe(false)
    expect(e.phrase).toMatch(/lien de boutique continue de fonctionner/)
    expect(e.peutSouscrire).toBe(true)
  })

  it('accès offert sans date lisible : terminé, sans inventer de date', () => {
    const e = etatAbonnementBoutique({ statut: 'offert', acces_offert_jusqu_au: 'bientôt' }, M)
    expect(e.accesCompte).toBe(false)
    expect(e.phrase).not.toMatch(/terminé le /)
    expect(e.date).toBeNull()
  })

  it('actif : prochaine date annoncée, portail ouvert, pas de nouvelle souscription', () => {
    const e = etatAbonnementBoutique({ statut: 'actif', fin: '2026-11-20' }, M)
    expect(e.phrase).toMatch(/Prochain prélèvement le 20 novembre 2026/)
    expect(e.peutGerer).toBe(true)
    expect(e.peutSouscrire).toBe(false)
  })

  it('en retard : le compte reste ouvert', () => {
    const e = etatAbonnementBoutique({ statut: 'en_retard' }, M)
    expect(e.accesCompte).toBe(true)
    expect(e.phrase).toMatch(/carte/)
  })

  it('résiliation programmée : passe avant « actif », annonce la fin, plus de prélèvement', () => {
    const e = etatAbonnementBoutique({ statut: 'actif', fin: '2026-11-20', annule: true }, M)
    expect(e.badge).toBe('Résiliation programmée')
    expect(e.phrase).toMatch(/jusqu’au 20 novembre 2026/)
    expect(e.phrase).not.toMatch(/Prochain prélèvement/)
    expect(e.accesCompte).toBe(true)
  })

  it('résiliation sur une période écoulée : terminé, compte fermé, on peut se réabonner', () => {
    const e = etatAbonnementBoutique({ statut: 'actif', fin: '2026-10-01', annule: true }, M)
    expect(e.accesCompte).toBe(false)
    expect(e.peutSouscrire).toBe(true)
  })

  it('résilié : ouvert jusqu’à la fin de période, fermé après', () => {
    expect(etatAbonnementBoutique({ statut: 'resilie', fin: '2026-11-01' }, M).accesCompte).toBe(true)
    expect(etatAbonnementBoutique({ statut: 'resilie', fin: '2026-10-01' }, M).accesCompte).toBe(false)
  })

  it('aucune phrase ne cite un prix', () => {
    for (const statut of ['aucun', 'offert', 'actif', 'en_retard', 'resilie']) {
      const e = etatAbonnementBoutique({ statut, acces_offert_jusqu_au: '2027-01-20', fin: '2026-11-20' }, M)
      expect(e.phrase).not.toMatch(/€/)
    }
  })
})
