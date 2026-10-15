import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ESSAI_JOURS, ESSAI_OUVERT_D_OFFICE_APRES_JOURS } from './essai.ts'

// Les sept jours existent deux fois : dans `ESSAI_JOURS` (le code) et dans le déclencheur SQL qui
// ouvre l'essai au premier aha (0091). Ce test empêche qu'ils divergent.
const sql = readFileSync(
  new URL('../../migrations/20261014120000_0091_essai_au_premier_aha.sql', import.meta.url),
  'utf8',
)

describe('migration 0091 — l’essai s’ouvre au premier aha', () => {
  it('ouvre l’essai pour la même durée que ESSAI_JOURS', () => {
    expect(sql).toContain(`now() + interval '${ESSAI_JOURS} days'`)
  })

  it('ouvre l’essai d’office après ESSAI_OUVERT_D_OFFICE_APRES_JOURS, une fois par jour', () => {
    expect(sql).toContain(`u.created_at <= now() - interval '${ESSAI_OUVERT_D_OFFICE_APRES_JOURS} days'`)
    expect(sql).toMatch(/cron\.schedule\(\s*'essai-ouverture-d-office'/)
  })

  it('ne touche ni les abonnés, ni les accès offerts, ni les comptes de test ou de démonstration', () => {
    for (const garde of ['p.stripe_subscription_id is null', 'not p.acces_gratuit', 'not p.est_test', 'not p.demo']) {
      expect(sql).toContain(garde)
    }
  })

  it('borne la prolongation manuelle à l’administration et à 1–60 jours', () => {
    expect(sql).toContain('public.est_admin()')
    expect(sql).toContain('p_jours < 1 or p_jours > 60')
  })

  it('pose un déclencheur sur les quatre événements « aha »', () => {
    for (const table of ['produits', 'depots', 'content_entries', 'chat_messages']) {
      expect(sql, table).toMatch(new RegExp(`after (insert|insert or update of status) on public\\.${table}\\b`))
    }
  })

  it('ne compte que les messages de la personne et les posts validés ou publiés', () => {
    expect(sql).toContain("new.role = 'user'")
    expect(sql).toContain("new.status in ('planifie', 'publie')")
  })

  it('ne rouvre que l’essai qui n’a pas commencé', () => {
    expect(sql).toMatch(/essai_fin is null/)
  })

  it('n’est pas appelable depuis le navigateur', () => {
    expect(sql).toMatch(/revoke execute on function public\.ouvrir_essai_au_premier_aha\(\) from public, anon, authenticated/)
  })
})
