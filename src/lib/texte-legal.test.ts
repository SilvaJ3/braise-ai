import { describe, expect, it } from 'vitest'
import { CONFIDENTIALITE, CONDITIONS, MENTIONS } from '../content/legal'
import { aCompleter, blocs, estProvisoire, sections, titreDocument } from './texte-legal'

describe('blocs', () => {
  it('reconnaît les trois formes et ignore le vide', () => {
    const b = blocs('## Un titre\n\nUn paragraphe.\n- une puce\n- une autre\n')
    expect(b).toEqual([
      { type: 'titre', texte: 'Un titre' },
      { type: 'para', texte: 'Un paragraphe.' },
      { type: 'point', texte: 'une puce' },
      { type: 'point', texte: 'une autre' },
    ])
  })

  it('recolle une ligne qui continue un paragraphe ou une puce, et sépare au saut de ligne', () => {
    expect(blocs('Un para\ncontinué.\n\nUn autre.\n- une puce\n  continuée\n- la suivante')).toEqual([
      { type: 'para', texte: 'Un para continué.' },
      { type: 'para', texte: 'Un autre.' },
      { type: 'point', texte: 'une puce continuée' },
      { type: 'point', texte: 'la suivante' },
    ])
  })

  it('ne rend pas de bloc vide sur des lignes blanches', () => {
    expect(blocs('\n\n   \n')).toEqual([])
  })
})

describe('sections', () => {
  it('range les blocs sous leur titre, dans l’ordre', () => {
    const s = sections('## A\np1\n- x\n## B\np2')
    expect(s.map((x) => x.titre)).toEqual(['A', 'B'])
    expect(s[0].blocs.map((b) => b.type)).toEqual(['para', 'point'])
    expect(s[1].blocs[0]).toEqual({ type: 'para', texte: 'p2' })
  })

  it('ouvre une section sans titre si le texte commence par un paragraphe', () => {
    const s = sections('p1\n## A\np2')
    expect(s[0].titre).toBeNull()
    expect(s[0].blocs[0].texte).toBe('p1')
  })
})

// Les deux pages sont des documents qu'un artisan peut opposer à l'éditeur : ce qui est vérifié
// ici, c'est qu'ils tiennent la route (sections présentes, puces intactes), pas leur rédaction.
describe('les textes légaux', () => {
  const attendusConditions = [
    'Ce que Braaise fait',
    'Ce que Braaise ne fait pas',
    'Abonnement, prix et TVA',
    'Résilier',
    'Le bon de dépôt et la signature',
    'Responsabilité',
    'Réclamations et droit applicable',
    'Éditeur',
  ]
  for (const titre of attendusConditions) {
    it(`les conditions portent la section « ${titre} »`, () => {
      expect(CONDITIONS).toContain(`## ${titre}`)
    })
  }

  it('les conditions disent ce que le produit ne fait pas, en puces', () => {
    const interdits = blocs(CONDITIONS).filter((b) => b.type === 'point')
    expect(interdits.length).toBeGreaterThanOrEqual(4)
    expect(interdits.map((b) => b.texte).join(' ')).toMatch(/comptabilité/)
  })

  it('la confidentialité distingue le responsable du sous-traitant', () => {
    expect(CONFIDENTIALITE).toContain('responsable de traitement')
    expect(CONFIDENTIALITE).toContain('sous-traitant')
    expect(CONFIDENTIALITE).toContain('clauses contractuelles types')
  })

  it('les deux textes sont en français et ne parlent pas des artisanes', () => {
    for (const texte of [CONDITIONS, CONFIDENTIALITE]) {
      expect(texte).not.toMatch(/\bartisanes?\b/i)
    }
  })

  // Garde-fou de publication : le bloc identité est rempli (nom, statut, siège, numéro d'entreprise,
  // contact). Ce qui reste en crochets est ce qui manque réellement, et chaque crochet garde le
  // bandeau provisoire : la date de mise à jour, l'article « Comptes boutique » (à écrire par JSB, offre
  // pas encore précisée) et les adresses de Supabase et de Resend, absentes du brouillon des mentions.
  // Si un crochet disparaît, ce test tombe : c'est le signal qu'il faut le retirer d'ici aussi.
  it('ne laisse en crochets que ce qui manque réellement', () => {
    expect(aCompleter(CONDITIONS + CONFIDENTIALITE + MENTIONS).sort()).toEqual(
      [
        '[DATE]',
        '[adresse de Resend à confirmer]',
        '[adresse de Supabase à confirmer]',
      ].sort(),
    )
    expect(estProvisoire(CONDITIONS)).toBe(true)
    expect(estProvisoire(CONFIDENTIALITE)).toBe(true)
    expect(estProvisoire(MENTIONS)).toBe(true)
  })

  // Le jour où ces lignes changent, c'est que l'identité publiée a bougé : à relire avant publication.
  it('publie l’identité de l’éditeur en clair', () => {
    expect(CONDITIONS).toContain('Junior Silva Braga Almeida')
    expect(CONDITIONS).toContain('1043.060.596')
    // Le numéro de TVA EST publié : VIES l'a confirmé valide le 06/10/2026 à 16h15, au nom de
    // l'éditeur. Il doit donc figurer en clair, avec le numéro d'entreprise.
    expect(CONDITIONS).toContain('BE 1043.060.596')
    expect(CONDITIONS).toContain('contact@braaise.io')
    expect(CONDITIONS).toContain('390 € HTVA par an')
    expect(CONFIDENTIALITE).toContain('Rue Cardinal Lavigerie 7, 1040 Etterbeek')
  })

  // Le numéro d'entreprise et le numéro de TVA sont ACTIFS depuis le 02/10/2026 (confirmation de
  // JSB) : l'abonnement se facture donc avec 21 % de TVA belge, au régime normal. Le test garde les
  // deux sens — la réserve ne doit plus être là, et le taux facturé doit être écrit.
  it('dit l’immatriculation et la TVA actives, au taux appliqué', () => {
    expect(CONDITIONS).not.toContain('immatriculation en cours')
    expect(CONDITIONS).not.toContain('pas encore active')
    expect(CONFIDENTIALITE).not.toContain('immatriculation en cours')
    expect(CONFIDENTIALITE).not.toContain('pas encore active')
    expect(CONDITIONS).not.toContain("aucun montant de TVA n'est")
    expect(CONDITIONS).toContain('21 %')
  })

  it('les conditions disent que Braaise est réservé aux professionnels', () => {
    expect(CONDITIONS).toContain('## Qui peut s\'abonner')
    expect(CONDITIONS).toContain('Braaise est réservé aux professionnels')
    expect(CONDITIONS).toContain('VI.47')
    expect(CONDITIONS).toContain('ne s\'applique pas aux contrats conclus entre professionnels')
    expect(CONDITIONS).toContain('tu déclares agir pour les besoins de ton activité professionnelle')
    expect(CONDITIONS).not.toMatch(/tu renonces/)
    // L'article « Comptes boutique » est écrit (décision JSB du 06/10) : plus de crochet.
    expect(CONDITIONS).toContain('Comptes boutique')
    expect(CONDITIONS).toContain('49 € HTVA par mois')
  })

  describe('RGPD', () => {
    it('donne une base légale à chaque traitement (art. 13.1.c)', () => {
      expect(CONFIDENTIALITE).toContain('## Sur quelle base')
      for (const base of ['art. 6.1.a', 'art. 6.1.b', 'art. 6.1.c', 'art. 6.1.f']) {
        expect(CONFIDENTIALITE).toContain(base)
      }
    })

    it('intègre l’accord de sous-traitance au lieu de le promettre sur demande (art. 28.3)', () => {
      expect(CONFIDENTIALITE).toContain('## Accord de sous-traitance')
      for (const lettre of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        expect(CONFIDENTIALITE).toContain(`art. 28.3.${lettre}`)
      }
      expect(CONFIDENTIALITE).not.toContain('disponible sur demande')
      expect(CONDITIONS).not.toContain('disponible sur demande')
      expect(CONDITIONS).toContain('intégré à la politique de confidentialité')
    })

    it('informe l’artisan d’une violation dans les meilleurs délais (art. 33.2)', () => {
      expect(CONFIDENTIALITE).toContain('Braaise t\'informe dans les meilleurs délais')
      expect(CONFIDENTIALITE).toContain('art. 33.2')
    })

    it('prévoit l’information et l’opposition en cas de changement de sous-traitant (art. 28.2, 28.4)', () => {
      expect(CONFIDENTIALITE).toContain('## Quand un sous-traitant change')
      expect(CONFIDENTIALITE).toContain('Tu peux t\'opposer à ce changement')
      expect(CONFIDENTIALITE).toContain('art. 28.4')
    })

    it('dit, pour chaque prestataire, son pays et son mécanisme de transfert (art. 44-46)', () => {
      const liste = blocs(CONFIDENTIALITE).filter((b) => b.type === 'point').map((b) => b.texte)
      for (const [nom, pays] of [
        ['Supabase', 'Francfort'],
        ['Vercel', 'États-Unis'],
        ['Stripe', 'Irlande'],
        ['Resend', 'États-Unis'],
        ['Anthropic', 'États-Unis'],
        ['OVH', 'France'],
        ['OpenStreetMap', 'pays et mécanisme'],
      ]) {
        const ligne = liste.find((t) => t.startsWith(nom))
        expect(ligne, nom).toBeDefined()
        expect(ligne, nom).toContain(pays)
      }
      expect(CONFIDENTIALITE).toContain('cadre de protection des données UE–États-Unis')
      expect(CONFIDENTIALITE).toContain('art. 46.2.c')
    })

    it('formule le retrait du consentement et l’opposition comme tels (art. 7.3, 21)', () => {
      expect(CONFIDENTIALITE).toContain('retirer ton consentement à tout moment (art. 7.3)')
      expect(CONFIDENTIALITE).toContain('le droit de t\'opposer')
      expect(CONFIDENTIALITE).toContain('art. 21.1')
    })

    it('informe la boutique de ses données (art. 13)', () => {
      expect(CONFIDENTIALITE).toContain('## Si tu es une boutique')
      expect(CONFIDENTIALITE).toContain('au moment où tes données sont collectées (art. 13')
    })
  })

  describe('les mentions légales', () => {
    it('portent l’identité, le numéro d’entreprise, l’adresse et le contact', () => {
      for (const attendu of [
        'Junior Silva Braga Almeida',
        'Rue Cardinal Lavigerie 7, 1040 Etterbeek',
        '1043.060.596',
        'contact@braaise.io',
      ]) {
        expect(MENTIONS).toContain(attendu)
      }
    })

    it('donnent le nom ET l’adresse de chaque hébergeur', () => {
      expect(MENTIONS).toContain('Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789')
      expect(MENTIONS).toContain('OVH SAS, 2 rue Kellermann, 59100 Roubaix')
      expect(MENTIONS).toContain('Supabase Inc., [adresse de Supabase à confirmer]')
      expect(MENTIONS).toContain('Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin')
    })

    // Le numéro est confirmé valide par VIES (06/10/2026) : les mentions doivent le publier, et
    // ne plus annoncer une identification « en cours » qui n'a plus lieu d'être.
    it('publient le numéro de TVA confirmé et n’annoncent plus une identification en cours', () => {
      expect(MENTIONS).toContain('BE 1043.060.596')
      expect(MENTIONS).not.toContain('identification de l\'éditeur à la TVA est en cours')
      // La phrase ne doit pas rester en suspens : « … le 6 octobre 2026) » puis « par le SPF Finances. »
      // traînait une fin de phrase de la version « en cours ».
      expect(MENTIONS).not.toContain('par le SPF Finances')
      // La TVA s'ajoute aux prix hors TVA : la mention doit le dire.
      expect(MENTIONS).toMatch(/TVA/)
    })
  })

  it('a un titre de document lisible', () => {
    expect(titreDocument(CONFIDENTIALITE)).toBe('En une phrase')
  })
})
