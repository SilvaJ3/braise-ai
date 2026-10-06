// Catalogue des formules d'accroche du bilan hebdomadaire.
//
// Méthode reprise du skill open-source ig-viral (accroches nommées : gabarit, exemple, version écran,
// « comment ça se rate »), mais le contenu est écrit pour l'artisanat, en français. Le skill n'a pas été
// recopié : seul le principe l'a été. Règle qui reste : on copie une FORME, jamais un script. L'exemple
// d'une formule montre sa forme sur un métier, il ne se réutilise pas tel quel pour un autre artisan.
//
// `signal` dit quand la formule sert : 'haut' (un article a décollé), 'bas' (un article a décroché) ou
// 'tous' (utilisable sans anomalie, ou pour l'un comme pour l'autre).

export type SignalVentes = 'haut' | 'bas'

export type Formule = {
  nom: string
  signal: SignalVentes | 'tous'
  /** Gabarit à trous : les {trous} se remplissent avec les chiffres et les faits de l'artisan. */
  gabarit: string
  exemple: { metier: string; texte: string }
  /** Texte affiché à l'écran pendant les premières secondes : 6 mots ou moins. */
  ecran: string
  /** L'erreur qui vide la formule de son sens. */
  commentCaSeRate: string
}

export const FORMULES_ACCROCHE: readonly Formule[] = [
  {
    nom: 'La démonstration muette',
    signal: 'haut',
    gabarit: 'Regarde ce que {durée} de {geste} font à {matière ou objet}.',
    exemple: {
      metier: 'céramiste',
      texte: 'Regarde ce que 8 secondes de tournage font à une boule de terre qui deviendra un bol à 22 €.',
    },
    ecran: 'LE BOL À 22 €',
    commentCaSeRate:
      "On commence par se présenter ou expliquer avant de montrer. La formule vit de l'image qui arrive dès la première seconde : si le geste n'est pas là tout de suite, il n'y a plus de démonstration, juste une introduction.",
  },
  {
    nom: 'Le reçu',
    signal: 'haut',
    gabarit: "J'ai vendu {N} {article} en {mois}. {Un détail vérifiable sur ces ventes}.",
    exemple: {
      metier: 'bougier',
      texte: "J'ai vendu 12 bougies Figuier en octobre. Sur ces 12, la moitié est partie par deux.",
    },
    ecran: '12 BOUGIES. 6 PAR DEUX.',
    commentCaSeRate:
      "Le chiffre est arrondi, gonflé ou pas relu. Dès qu'il n'est plus celui du carnet de ventes, la formule ment, et un client qui connaît l'atelier le sent. Le détail doit se vérifier, pas se deviner.",
  },
  {
    nom: 'Le raté assumé',
    signal: 'bas',
    gabarit: "{N} {articles} déposés, {M} vendus. Voilà ce que j'en tire.",
    exemple: {
      metier: 'céramiste',
      texte: "14 vases déposés cette saison, 2 vendus. Voilà ce que j'en tire.",
    },
    ecran: '14 DÉPOSÉS. 2 VENDUS.',
    commentCaSeRate:
      "On s'excuse ou on se plaint au lieu de tirer une leçon. La formule n'a de valeur que si la fin donne quelque chose : une hypothèse, un changement de prix, un test. Sans cela, c'est de la plainte, pas un raté assumé.",
  },
  {
    nom: "L'envers de l'atelier",
    signal: 'tous',
    gabarit: "Ce qu'on ne voit jamais quand on achète {article} : {étape cachée}.",
    exemple: {
      metier: 'maroquinière',
      texte: "Ce qu'on ne voit jamais quand on achète un porte-cartes : les 40 minutes de ponçage du bord.",
    },
    ecran: 'LES 40 MINUTES CACHÉES',
    commentCaSeRate:
      "L'étape montrée est celle que tout le monde connaît déjà (la découpe, la cuisson). Il faut une étape que le client n'imagine pas. Si elle ne le surprend pas, l'accroche promet un secret et n'en livre pas.",
  },
  {
    nom: 'Avant, après',
    signal: 'tous',
    gabarit: '{État brut} devient {objet fini} en {durée}.',
    exemple: {
      metier: 'ébéniste',
      texte: 'Une planche de noyer pleine de nœuds devient une table de chevet en trois jours.',
    },
    ecran: 'NOYER BRUT, TABLE FINIE',
    commentCaSeRate:
      "La durée annoncée n'est pas la vraie. Si les trois jours sont en réalité trois semaines avec le séchage, le client qui commande le découvrira. Mieux vaut une durée exacte et moins spectaculaire.",
  },
  {
    nom: 'Le prix expliqué',
    signal: 'haut',
    gabarit: 'Pourquoi {article} coûte {prix}, pièce par pièce.',
    exemple: {
      metier: 'bijoutière',
      texte: 'Pourquoi cette bague coûte 85 €, pièce par pièce : argent, 3 heures de limage, pierre, emballage.',
    },
    ecran: 'POURQUOI 85 €',
    commentCaSeRate:
      "La décomposition ne tombe pas juste : les lignes ne s'additionnent pas au prix, ou le temps de travail est oublié. Un client qui fait le calcul de tête doit retrouver le prix affiché.",
  },
  {
    nom: 'La demande du client',
    signal: 'haut',
    gabarit: "Un client m'a demandé {demande précise}. Voilà ce que j'ai fait.",
    exemple: {
      metier: 'relieur',
      texte: "Un client m'a demandé de relier les lettres de son grand-père dans un seul volume. Voilà ce que j'ai fait.",
    },
    ecran: 'SES LETTRES, UN LIVRE',
    commentCaSeRate:
      "La demande est inventée ou trop lisse. La formule vaut par le détail précis d'une vraie commande, avec son accord si le client est reconnaissable. Une demande générique (« un cadeau original ») n'accroche personne.",
  },
  {
    nom: "L'erreur de débutant",
    signal: 'bas',
    gabarit: "Ma première {pièce} a raté à cause de {cause}. Aujourd'hui, {ce que je fais autrement}.",
    exemple: {
      metier: 'savonnier',
      texte:
        "Mon premier lot de savon s'est fissuré à cause d'une température trop haute. Aujourd'hui, je mesure à chaque coulée.",
    },
    ecran: 'MON PREMIER LOT FISSURÉ',
    commentCaSeRate:
      "L'erreur est cosmétique, ou corrigée depuis si longtemps qu'elle ne coûte plus rien à raconter. Il faut une erreur qui a coûté du temps ou de la matière, sinon la modestie sonne faux.",
  },
  {
    nom: 'La saison qui arrive',
    signal: 'haut',
    gabarit: '{Saison ou fête} approche : voilà ce que je prépare, et ce qui part déjà.',
    exemple: {
      metier: 'tisserande',
      texte: 'Novembre approche : voilà ce que je prépare, et ce qui part déjà. Les plaids en laine, 9 vendus ce mois-ci.',
    },
    ecran: 'NOVEMBRE : LES PLAIDS PARTENT',
    commentCaSeRate:
      "On cite la saison sans la preuve des ventes. L'intérêt est d'appuyer l'envie d'achat sur un chiffre réel de l'atelier. Sans lui, c'est une annonce de calendrier que tout le monde publie.",
  },
  {
    nom: 'Deux versions',
    signal: 'tous',
    gabarit: "{Version A} ou {version B} ? J'ai fait les deux. Voilà celle qui est partie.",
    exemple: {
      metier: 'céramiste',
      texte: "Émail sable ou émail ardoise ? J'ai fait les deux. Le sable est parti 12 fois, l'ardoise 3.",
    },
    ecran: 'SABLE OU ARDOISE ?',
    commentCaSeRate:
      "Le résultat est caché ou flou. Si on ne donne pas la vente de chaque version, la question reste sans réponse et le spectateur n'apprend rien. La comparaison doit porter sur deux chiffres réels.",
  },
  {
    nom: "L'outil qui a vécu",
    signal: 'tous',
    gabarit: 'Cet outil a {N} ans et il fait toujours {tâche}.',
    exemple: {
      metier: 'boulanger',
      texte: 'Ce pétrin a 31 ans et il fait toujours les 40 pains du samedi.',
    },
    ecran: '31 ANS, 40 PAINS',
    commentCaSeRate:
      "L'outil est présenté pour lui-même, sans lien avec ce que le client achète. La formule marche quand l'ancienneté de l'outil rend visible la qualité de l'article. Sinon c'est de la nostalgie sans suite.",
  },
  {
    nom: "La question qu'on me pose",
    signal: 'tous',
    gabarit: "On me demande toujours {question}. Voilà la vraie réponse.",
    exemple: {
      metier: 'bougier',
      texte:
        "On me demande toujours pourquoi mes bougies coûtent 24 €. Voilà la vraie réponse : la cire de soja, la mèche en coton, et 7 jours de séchage.",
    },
    ecran: 'POURQUOI 24 € ?',
    commentCaSeRate:
      "La question est fabriquée. Si personne ne l'a jamais posée à l'atelier, l'artisan le sait et son public aussi. Partir d'une vraie question entendue au marché ou en boutique, avec ses mots à lui.",
  },
]

export const NOMS_FORMULES: readonly string[] = FORMULES_ACCROCHE.map((f) => f.nom)

/** Le catalogue, mis en texte pour les consignes du modèle (gabarit, écran et piège, sans l'exemple). */
export function catalogueEnTexte(): string {
  return FORMULES_ACCROCHE.map(
    (f, i) =>
      `${i + 1}. ${f.nom} (${f.signal === 'tous' ? 'signal haut ou bas' : `signal ${f.signal}`})\n` +
      `   Gabarit : ${f.gabarit}\n` +
      `   À l'écran : ${f.ecran}\n` +
      `   Se rate quand : ${f.commentCaSeRate}`,
  ).join('\n')
}
