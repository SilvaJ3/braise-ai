import { describe, expect, it } from 'vitest'
import { etatCompte, joursProlongation, libelleBascule, nomCompte, resumeComptes, type CompteAdmin } from './admin-comptes'

const MAINTENANT = new Date('2026-10-01T10:00:00.000Z')
const dans = (jours: number) => new Date(MAINTENANT.getTime() + jours * 86_400_000).toISOString()

function compte(over: Partial<CompteAdmin> = {}): CompteAdmin {
  return {
    user_id: '11111111-1111-1111-1111-111111111111',
    email: 'artisan@example.com',
    plan: 'essai',
    abonnement_statut: 'aucun',
    essai_fin: dans(3),
    acces_gratuit: false,
    acces_gratuit_depuis: null,
    est_test: false,
    demo: false,
    ouvert_le: '2026-09-29T08:00:00.000Z',
    ...over,
  }
}

describe('etatCompte', () => {
  it('pendant l’essai, dit les jours restants', () => {
    const e = etatCompte(compte(), MAINTENANT)
    expect(e).toMatchObject({ ouvert: true, badge: 'Essai — 3 j', basculable: true, offert: false })
    expect(e.phrase).toContain('3 jours')
  })

  it('un accès offert passe avant tout le reste, et se dit', () => {
    const e = etatCompte(
      compte({ acces_gratuit: true, acces_gratuit_depuis: '2026-10-01T09:00:00.000Z', essai_fin: dans(-30) }),
      MAINTENANT,
    )
    expect(e).toMatchObject({ ouvert: true, badge: 'Offert', offert: true })
    expect(e.phrase).toContain('depuis le 1 octobre 2026')
  })

  it('un compte de test garde l’accès et n’a rien à régler', () => {
    const e = etatCompte(compte({ est_test: true, essai_fin: dans(-30) }), MAINTENANT)
    expect(e).toMatchObject({ ouvert: true, badge: 'Compte de test', basculable: false })
    expect(e.phrase).toContain('deviendra un compte utilisateur')
  })

  it('un compte de démonstration se distingue du compte de test (02/10)', () => {
    const e = etatCompte(compte({ demo: true, essai_fin: dans(-30) }), MAINTENANT)
    expect(e).toMatchObject({ ouvert: true, badge: 'Démonstration', basculable: false })
    expect(e.phrase).toContain('n’écrit à une boutique')
  })

  it('la démonstration passe avant le test quand les deux drapeaux sont posés', () => {
    const e = etatCompte(compte({ demo: true, est_test: true }), MAINTENANT)
    expect(e.badge).toBe('Démonstration')
  })

  it('un abonnement qui paie se lit « Abonné », même essai fini', () => {
    const e = etatCompte(compte({ abonnement_statut: 'actif', essai_fin: dans(-30) }), MAINTENANT)
    expect(e).toMatchObject({ ouvert: true, badge: 'Abonné' })
  })

  it('un prélèvement en échec reste un abonné : l’accès ne se ferme pas', () => {
    const e = etatCompte(compte({ abonnement_statut: 'en_retard', essai_fin: dans(-30) }), MAINTENANT)
    expect(e).toMatchObject({ ouvert: true, badge: 'Abonné — en retard' })
  })

  it('essai fini et rien d’ouvert : le compte est fermé, et l’écran le dit', () => {
    const e = etatCompte(compte({ essai_fin: dans(-1) }), MAINTENANT)
    expect(e).toMatchObject({ ouvert: false, badge: 'Fermé', offert: false, basculable: true })
  })
})

describe('libelleBascule', () => {
  it('dit ce que le bouton fera', () => {
    expect(libelleBascule(compte())).toBe('Offrir l’accès')
    expect(libelleBascule(compte({ acces_gratuit: true }))).toBe('Retirer l’accès offert')
  })
})

describe('nomCompte', () => {
  it('rend l’adresse, ou un morceau d’identifiant quand il n’y en a pas', () => {
    expect(nomCompte(compte())).toBe('artisan@example.com')
    expect(nomCompte(compte({ email: null }))).toBe('11111111')
  })
})

describe('resumeComptes', () => {
  it('compte les comptes, les accès offerts et ceux qui sont sans accès', () => {
    const liste = [
      compte(),
      compte({ user_id: 'a', acces_gratuit: true }),
      compte({ user_id: 'b', essai_fin: dans(-5) }),
    ]
    expect(resumeComptes(liste, MAINTENANT)).toBe('3 comptes · 1 offert · 1 sans accès.')
  })

  it('ne parle pas d’accès offert quand il n’y en a pas, et gère la liste vide', () => {
    expect(resumeComptes([compte()], MAINTENANT)).toBe('1 compte · 0 offert.')
    expect(resumeComptes([], MAINTENANT)).toBe('Aucun compte à afficher.')
  })
})

describe('essai pas commencé et prolongation (0091)', () => {
  const neuf: CompteAdmin = {
    user_id: 'u1', email: 'neuf@exemple.be', plan: 'essai', abonnement_statut: 'aucun',
    essai_fin: null, acces_gratuit: false, acces_gratuit_depuis: null, est_test: false, demo: false, ouvert_le: null,
  }

  it('un compte sans date d’essai est ouvert, pas « fermé », et prolongeable', () => {
    const e = etatCompte(neuf)
    expect(e.ouvert).toBe(true)
    expect(e.badge).toBe('Essai à démarrer')
    expect(e.phrase).toContain('première action')
    expect(e.prolongeable).toBe(true)
  })

  it('un compte fermé est prolongeable ; un abonné, un offert et un testeur ne le sont pas', () => {
    const maintenant = new Date('2026-10-14T10:00:00Z')
    expect(etatCompte({ ...neuf, essai_fin: '2026-10-01T00:00:00Z' }, maintenant).prolongeable).toBe(true)
    expect(etatCompte({ ...neuf, abonnement_statut: 'actif' }, maintenant).prolongeable).toBe(false)
    expect(etatCompte({ ...neuf, acces_gratuit: true }, maintenant).prolongeable).toBe(false)
    expect(etatCompte({ ...neuf, est_test: true }, maintenant).prolongeable).toBe(false)
  })

  it('joursProlongation accepte un entier de 1 à 60 et rien d’autre', () => {
    expect(joursProlongation('7')).toBe(7)
    expect(joursProlongation(' 60 ')).toBe(60)
    expect(joursProlongation(1)).toBe(1)
    for (const mauvais of ['', '0', '61', '-3', '2.5', 'abc', null, undefined, NaN]) {
      expect(joursProlongation(mauvais)).toBeNull()
    }
  })
})
