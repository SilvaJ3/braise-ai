import { Link } from 'react-router-dom'

/**
 * « Premiers pas » — la page qu'on rouvre quand on ne sait plus où aller.
 *
 * Décision de JSB (19/09, reprise dans ROADMAP) : pas de visite guidée des fonctionnalités. Une
 * visite se traverse en quatre taps et ne laisse rien ; cette page, elle, se rouvre depuis Compte,
 * et elle dit où mène chaque écran en une phrase.
 *
 * Ordre des trois premières étapes = l'ordre des dépendances réelles (c'est celui de la carte
 * « Pour démarrer » sur l'accueil) : une boutique, des produits, puis le premier bon — parce qu'un
 * bon a besoin d'une boutique et de pièces pour être rempli.
 */
const PREMIERES_ETAPES: { titre: string; texte: string; to: string; lien: string }[] = [
  {
    titre: '1. Une boutique',
    texte: 'Le point de vente où tu déposes. Sans elle, rien ne peut être déposé ni commandé.',
    to: '/boutiques',
    lien: 'Mes boutiques',
  },
  {
    titre: '2. Tes produits',
    texte:
      'Une ligne par pièce, avec son prix. C’est ce qui remplit les bons — et si tu as un tableur, tu peux le charger plutôt que de tout retaper.',
    to: '/atelier',
    lien: 'Atelier → Produits',
  },
  {
    titre: '3. Ton premier bon de dépôt',
    texte:
      'Tu choisis les pièces, la boutique signe au doigt, le PDF part par mail et reste archivé. C’est la pièce que tu montres en cas de question.',
    to: '/boutiques',
    lien: 'Depuis la fiche d’une boutique',
  },
]

const ECRANS: { nom: string; texte: string; to: string }[] = [
  {
    nom: 'Aujourd’hui',
    texte: 'Ce qui compte maintenant : ce qu’il y a à faire, et ce qui manque pour le faire.',
    to: '/',
  },
  {
    nom: 'Planning',
    texte: 'Ce que tu prépares et publies cette semaine, sans y repenser.',
    to: '/planning',
  },
  {
    nom: 'Boutiques',
    texte:
      'Chaque boutique, ses dépôts, ses ventes, ce qui te reste chez elle — et la page à lui donner pour qu’elle confirme et redemande.',
    to: '/boutiques',
  },
  {
    nom: 'Atelier',
    texte:
      'Produits, matières, recettes, à commander, commandes fournisseur, import. Ce qui manque est calculé depuis tes recettes et tes commandes — pas depuis ce que tu n’as pas encodé.',
    to: '/atelier',
  },
  {
    nom: 'Commandes',
    texte: 'Les commandes reçues : carnet, boutique, marché, encodées au même endroit.',
    to: '/commandes/nouvelle',
  },
  {
    nom: 'Assistant',
    texte:
      'Il répond sur ton atelier : tes produits, tes boutiques, ton stock, ton planning. Plus tu encodes, plus il est précis.',
    to: '/assistant',
  },
]

export default function PremiersPas() {
  return (
    <>
      <Link to="/compte" className="link" style={{ marginBottom: 8, display: 'inline-block' }}>
        ← Compte
      </Link>
      <h1>Premiers pas</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Braaise ne se configure pas : tu encodes, il t’aide. Voilà l’ordre qui marche, et à quoi sert
        chaque écran.
      </p>

      <h2>Par où commencer</h2>
      <div className="card">
        {PREMIERES_ETAPES.map((e, i) => (
          <div key={e.titre} style={i > 0 ? { marginTop: 14 } : undefined}>
            <strong>{e.titre}</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {e.texte}
            </p>
            <Link to={e.to} className="link">
              {e.lien} →
            </Link>
          </div>
        ))}
        <p className="muted" style={{ margin: '14px 0 0', fontSize: '0.85rem' }}>
          Le planning vient après : il sert quand tu publies, et il attend que le reste soit en
          place.
        </p>
      </div>

      <h2>Les écrans</h2>
      <div className="card" style={{ padding: 0 }}>
        {ECRANS.map((e, i) => (
          <Link
            key={e.nom}
            to={e.to}
            className="row settings-row"
            style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}
          >
            <div>
              <div>{e.nom}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {e.texte}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <h2>Sur ton téléphone</h2>
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Braaise s’ajoute à l’écran d’accueil comme une application, et il envoie ses notifications.
          Deux réglages à faire une fois, sur ton téléphone.
        </p>
        <Link to="/compte/telephone" className="link">
          Installer Braaise et activer les notifications →
        </Link>
      </div>

      <h2>Ce que Braaise ne fait pas</h2>
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Pas de comptabilité, pas de factures, pas de TVA, pas de cotisations, pas de banque, pas de
          boutique en ligne. Braaise s’occupe de l’atelier : les dépôts, les commandes, le planning.
          Et le stock qu’il affiche est une indication calculée depuis ce que tu as encodé, jamais une
          garantie.
        </p>
      </div>

      <p className="muted" style={{ marginTop: 20, fontSize: '0.85rem' }}>
        Une question qui n’est pas ici ? Pose-la à l’assistant — il connaît ton atelier.
      </p>
    </>
  )
}
