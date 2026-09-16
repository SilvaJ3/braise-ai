import { describe, expect, it } from 'vitest'
import {
  avertissementContexte,
  boutiquesContext,
  dernierContactParBoutique,
  joursDepuis,
  messageRelanceBoutique,
  planningContext,
  produitsContext,
  profilContext,
  stockContext,
  type Entry,
} from './contexte-assistant'

// Aucun bloc envoyé au modèle ne doit porter l'identité d'un compte précis : depuis l'onboarding
// (migration 0036), le produit sert plusieurs artisans et l'assistant ne sait que ce que la ligne
// `assistant_profil` lui dit.
const IDENTITES_INTERDITES = [/alexandra/i, /bougie/i]

function verifierNeutre(bloc: string): void {
  for (const interdit of IDENTITES_INTERDITES) expect(bloc).not.toMatch(interdit)
}

const ENTREE: Entry = {
  title: 'Coulée du mercredi',
  platform: 'instagram',
  type: 'reel',
  date: '2026-10-01',
  status: 'idee',
  notes: 'montrer les coulisses',
}

const MAINTENANT = new Date('2026-09-16T12:00:00Z').getTime()

describe('profilContext', () => {
  it("n'invente rien quand le profil est vide, et invite à le remplir", () => {
    const bloc = profilContext(null)
    expect(bloc).toMatch(/profil n'est pas encore renseigné/)
    expect(bloc).toMatch(/Compte → Ma voix de marque/)
    expect(bloc).not.toMatch(/Activité déclarée/)
    expect(bloc).not.toMatch(/Nom commercial/)
    verifierNeutre(bloc)
  })

  it('reprend activité, nom commercial et lieu quand ils sont renseignés', () => {
    const bloc = profilContext({
      metier: 'céramiste',
      nom_commercial: 'Terre & Feu',
      ville: 'Namur',
      pays: 'Belgique',
      contenu: '',
    })
    expect(bloc).toMatch(/Activité déclarée : céramiste\./)
    expect(bloc).toMatch(/Nom commercial : Terre & Feu\./)
    expect(bloc).toMatch(/Basée à : Namur\./)
    expect(bloc).not.toMatch(/pas encore renseigné/)
    verifierNeutre(bloc)
  })

  it("n'ajoute pas de consigne de prudence dès qu'une voix de marque existe", () => {
    const bloc = profilContext({
      metier: null,
      nom_commercial: null,
      ville: null,
      pays: null,
      contenu: 'Ton chaleureux, tutoiement, jamais mièvre.',
    })
    expect(bloc).toMatch(/\(Belgique\)/)
    expect(bloc).toMatch(/Voix de marque \(à respecter\) :\nTon chaleureux/)
    expect(bloc).not.toMatch(/pas encore renseigné/)
    verifierNeutre(bloc)
  })

  it('tolère les champs absents ou vides sans produire de ligne vide', () => {
    const bloc = profilContext({
      metier: '   ',
      nom_commercial: null,
      ville: '',
      pays: '  ',
      contenu: '   ',
    })
    expect(bloc).toMatch(/\(Belgique\)/)
    expect(bloc).not.toMatch(/Activité déclarée/)
    expect(bloc).toMatch(/pas encore renseigné/)
  })

  it("dit où la personne vend, en français, quand l'onboarding l'a recueilli", () => {
    const bloc = profilContext({
      metier: 'céramiste',
      nom_commercial: null,
      ville: null,
      pays: null,
      canaux: ['boutiques', 'marches'],
      plateformes: ['instagram'],
      contenu: '',
    })
    expect(bloc).toMatch(/Canaux de vente : dépôt-vente en boutiques, marchés artisanaux\./)
    expect(bloc).toMatch(/Plateformes sociales utilisées : Instagram/)
    verifierNeutre(bloc)
  })

  it('ignore une valeur de canal inconnue au lieu de la recracher', () => {
    const bloc = profilContext({
      metier: 'céramiste',
      nom_commercial: null,
      ville: null,
      pays: null,
      canaux: ['boutiques', 'ebay'],
      plateformes: ['myspace'],
      contenu: '',
    })
    expect(bloc).toMatch(/Canaux de vente : dépôt-vente en boutiques\./)
    expect(bloc).not.toMatch(/ebay/)
    expect(bloc).not.toMatch(/myspace/)
    expect(bloc).not.toMatch(/Plateformes sociales/)
  })

  it('ne dit rien des canaux ni des plateformes quand rien n\'a été renseigné', () => {
    const bloc = profilContext({ metier: 'céramiste', nom_commercial: null, ville: null, pays: null, contenu: '' })
    expect(bloc).not.toMatch(/Canaux de vente/)
    expect(bloc).not.toMatch(/Plateformes sociales/)
  })
})

describe('planningContext', () => {
  it('dit qu\'il n\'y a rien quand c\'est vide, sous un titre générique', () => {
    const bloc = planningContext([])
    expect(bloc).toMatch(/Planning actuel :/)
    expect(bloc).toMatch(/Aucune entrée dans le planning pour le moment\./)
    verifierNeutre(bloc)
  })

  it('rend une ligne par entrée', () => {
    const bloc = planningContext([ENTREE])
    expect(bloc).toContain('- Coulée du mercredi (2026-10-01, idee, instagram, reel) — montrer les coulisses')
    verifierNeutre(bloc)
  })

  it('accepte les entrées sans date ni plateforme', () => {
    const bloc = planningContext([{ ...ENTREE, date: null, platform: null, type: null, notes: null }])
    expect(bloc).toContain('- Coulée du mercredi (sans date, idee, —, —)')
  })
})

describe('produitsContext', () => {
  it('ne produit aucun bloc quand le catalogue est vide', () => {
    expect(produitsContext([])).toBe('')
  })

  it('liste les produits sous un titre générique', () => {
    const bloc = produitsContext([
      { nom: 'Bol émaillé', senteur: null, description: null, prix_vente: 32, saison: 'hiver' },
      { nom: 'Vase haut', senteur: null, description: 'pièce unique', prix_vente: null, saison: 'toute_annee' },
    ])
    expect(bloc).toMatch(/Catalogue produits :/)
    expect(bloc).toContain('- Bol émaillé (32 €, hiver)')
    expect(bloc).toContain('- Vase haut — pièce unique')
    verifierNeutre(bloc)
  })
})

describe('boutiques et contacts', () => {
  const contacts = [
    { boutique_id: 'a', date: '2026-06-01' },
    { boutique_id: 'a', date: '2026-09-06' },
    { boutique_id: 'b', date: '2026-08-20' },
  ]

  it('garde le contact le plus récent, quel que soit l\'ordre de la requête', () => {
    const dernier = dernierContactParBoutique(contacts)
    expect(dernier.get('a')).toBe('2026-09-06')
    expect(dernier.get('b')).toBe('2026-08-20')
    expect(dernier.has('c')).toBe(false)
  })

  it('compte les jours et rédige la relance', () => {
    expect(joursDepuis('2026-09-06', MAINTENANT)).toBe(10)
    expect(messageRelanceBoutique('Le Comptoir', 10)).toBe('Le Comptoir : pas de contact depuis 1 semaine')
    expect(messageRelanceBoutique('Le Comptoir', 21)).toBe('Le Comptoir : pas de contact depuis 3 semaines')
    expect(messageRelanceBoutique('Le Comptoir', Infinity)).toBe('Le Comptoir : jamais contactée')
  })

  it('décrit les boutiques sans nommer personne', () => {
    const bloc = boutiquesContext(
      [
        { id: 'a', nom: 'Le Comptoir', canal_prefere: 'mail' },
        { id: 'z', nom: 'Atelier Neuf', canal_prefere: null },
      ],
      contacts,
      MAINTENANT,
    )
    expect(bloc).toMatch(/Boutiques en dépôt-vente :/)
    expect(bloc).toContain('- Le Comptoir (mail) — dernier contact il y a 10 j')
    expect(bloc).toContain('- Atelier Neuf — jamais contactée')
    verifierNeutre(bloc)
  })

  it('ne produit aucun bloc quand il n\'y a aucune boutique', () => {
    expect(boutiquesContext([], contacts, MAINTENANT)).toBe('')
  })
})

describe('stockContext', () => {
  it('ne produit aucun bloc quand il n\'y a aucune matière', () => {
    expect(stockContext([])).toBe('')
  })

  it('signale les matières sous le seuil', () => {
    const bloc = stockContext([
      {
        id: '1',
        nom: 'Cire de soja',
        unite: 'kg',
        stock_actuel: 2,
        seuil_alerte: 5,
        fournisseur: { nom: 'Mercerie du Nord', delai_livraison_jours: 7 },
      },
      { id: '2', nom: 'Mèche coton', unite: 'piece', stock_actuel: 200, seuil_alerte: 50, fournisseur: null },
    ])
    expect(bloc).toMatch(/Stock de matières premières :/)
    expect(bloc).toContain('- Cire de soja : 2 kg, seuil 5 kg, chez Mercerie du Nord, délai 7 j')
    expect(bloc).toContain('- Mèche coton : 200 pc, seuil 50 pc')
    expect(bloc).toMatch(/Sous le seuil \(à recommander\) : Cire de soja\./)
    verifierNeutre(bloc)
  })
})

describe('avertissementContexte', () => {
  it('distingue « vide » de « indisponible » sans nommer la personne', () => {
    const bloc = avertissementContexte('planning')
    expect(bloc).toMatch(/planning momentanément illisible/)
    expect(bloc).toMatch(/ne rien affirmer sur ce point/)
    verifierNeutre(bloc)
  })
})
