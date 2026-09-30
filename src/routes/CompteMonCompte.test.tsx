import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CompteMonCompte from './CompteMonCompte'

// L'écran est monté pour de vrai et on lit le HTML rendu : ce qui compte ici est ce qu'un artisan
// voit de son forfait — une jauge, deux nombres en questions, et rien qui parle de jetons avant
// qu'il ne les demande. Les requêtes sont remplacées (lib/profil importe le client Supabase, qui
// exige des variables d'environnement) : ce banc d'essai ne demande ni base, ni configuration.

const { etat } = vi.hoisted(() => ({
  etat: { data: {} as Record<string, unknown>, isLoading: false, isError: false },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
  useSearchParams: () => [new URLSearchParams(), () => {}],
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}))

vi.mock('../lib/profil', () => ({
  useMonCompte: () => etat,
  useOuvrirPaiement: () => ({ mutate: () => {}, mutateAsync: async () => null, isPending: false, isSuccess: false, data: null, error: null }),
  useOuvrirPortail: () => ({ mutate: () => {}, mutateAsync: async () => null, isPending: false, isSuccess: false, data: null, error: null }),
  useAcheterPack: () => ({ mutate: () => {}, isPending: false }),
}))

/** Un compte mensuel dont l'enveloppe vaut 300 questions (1 500 000 jetons, 5 000 par question). */
function compte(over: Record<string, unknown> = {}) {
  return {
    plan: 'mensuel',
    quota_derogation: null,
    mois: '2026-09',
    abonnement_statut: 'actif',
    abonnement_fin: '2026-10-30',
    abonnement_prix_centimes: 3900,
    jetons_consommes: 300_000,
    credits_jetons: 0,
    detail: [],
    appels: 12,
    input_tokens: 100_000,
    output_tokens: 20_000,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    recherches_web: 0,
    questions_utilisees: 0,
    imports_utilises: 0,
    ...over,
  }
}

const rendre = () => renderToStaticMarkup(<CompteMonCompte />)

describe('Mon compte — la jauge du forfait, en questions', () => {
  beforeEach(() => {
    etat.isLoading = false
    etat.isError = false
    etat.data = compte()
  })

  it('montre une barre de progression sur ce qui est disponible', () => {
    const html = rendre()
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="60"')
    expect(html).toContain('aria-valuemin="0"')
    expect(html).toContain('aria-valuemax="300"')
    expect(html).toContain('width:20%')
  })

  it('donne les deux nombres en questions, et le pourcentage', () => {
    const html = rendre()
    expect(html).toContain('60 sur 300')
    expect(html).toContain('20 %')
    expect(html).toContain('Il te reste environ 240 questions')
  })

  it('ne parle plus de jetons avant qu’on les demande', () => {
    const html = rendre()
    const avantLeDetail = html.split('Voir le détail')[0]
    expect(avantLeDetail).not.toContain('jeton')
  })

  it('compte les jetons achetés dans ce qui est disponible', () => {
    // 60 questions consommées, un pack de 50 000 jetons posé à côté : 300 + 10 = 310 disponibles.
    etat.data = compte({ credits_jetons: 50_000 })
    const html = rendre()
    expect(html).toContain('aria-valuemax="310"')
    expect(html).toContain('60 sur 310')
    expect(html).toContain('19 %')
  })

  it('remplit la barre et le dit quand le forfait du mois est épuisé', () => {
    etat.data = compte({ jetons_consommes: 1_500_000 })
    const html = rendre()
    expect(html).toContain('aria-valuenow="300"')
    expect(html).toContain('width:100%')
    expect(html).toContain('Forfait du mois utilisé')
    expect(html).toContain('ça se recharge le 1er du mois prochain')
  })

  it('garde les anciens compteurs quand la base ne connaît pas encore l’enveloppe', () => {
    etat.data = compte({ jetons_consommes: undefined, questions_utilisees: 12 })
    const html = rendre()
    expect(html).not.toContain('role="progressbar"')
    // Les anciens quotas de questions du plan, pas l'enveloppe en jetons.
    expect(html).toContain('12 sur 150')
  })
})
