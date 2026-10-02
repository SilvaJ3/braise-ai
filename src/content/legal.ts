// Le texte des pages légales, gardé hors des écrans : c'est un document, pas de la mise en page.
//
// Format volontairement pauvre, pour que le rendu reste le même partout et que rien ne dépende
// d'un moteur de markdown : `## ` ouvre une section, `- ` une puce, le reste est un paragraphe.
// Le lecteur : `src/lib/texte-legal.ts` (pur, testé).
//
// ÉTAT : brouillons rédigés le 29/09/2026, identité de l'éditeur renseignée le 29/09 au soir.
//
// Statut de l'immatriculation, confirmé par JSB le 02/10/2026 : le numéro d'entreprise 1043.060.596
// est **actif**, et le numéro de TVA BE 1043.060.596 est **activé** — assujetti au régime normal,
// donc 21 % de TVA en Belgique, calculés au paiement par Stripe Tax. Les deux réserves qui
// figuraient ici (« attribué mais pas encore actif », « identification en cours ») sont tombées.
//
// À FAIRE ensuite : la relecture juridique/comptable et la date de mise à jour. La page porte un
// bandeau provisoire tant qu'un crochet `[...]` subsiste.
//
// La source de ces deux textes, avec les points à trancher : ~/projets-clients/braaise-legal/.

export const CONDITIONS = `## Ce que Braaise fait

Braaise est un assistant pour l'atelier : le bon de dépôt rempli sur le téléphone et signé par la
boutique, les boutiques et les commandes au même endroit, les matières et les besoins, le planning
des publications, et un assistant qui répond sur les données de l'atelier.

Braaise te signale ce qui manque à partir de ce que tu as encodé. Il ne le constate pas à ta place :
une matière non encodée lui est invisible, et le calcul du besoin dépend de tes recettes et de tes
commandes saisies.

## Ce que Braaise ne fait pas

- ni comptabilité, ni factures, ni TVA, ni déclarations
- ni cotisations sociales, paie ou personnel
- ni banque, ni trésorerie
- ni boutique en ligne, ni e-commerce, ni encaissement pour ton compte
- ni inventaire garanti, ni valorisation de stock

Tu restes seul responsable de tes obligations légales, fiscales et comptables. Le stock affiché est
une indication, jamais une garantie.

## Ton compte

L'accès se fait sur invitation. Les identifiants sont personnels : un compte par artisan, qui ne se
partage pas. Garde ton mot de passe pour toi et signale-nous toute utilisation que tu n'as pas
autorisée.

Braaise s'installe depuis le navigateur, sur le téléphone, comme une application (PWA) : il n'y a
pas d'application dans l'App Store ni sur Google Play. L'installation, les notifications et la
connexion sont expliquées dans l'application, à l'écran « Sur mon téléphone ».

## L'essai

L'essai dure sept jours et s'ouvre en enregistrant un moyen de paiement : la carte est demandée à
l'entrée, aucun prélèvement n'a lieu avant la fin de l'essai, et tu es prévenu deux jours avant, puis
la veille. Tu peux arrêter l'abonnement avant cette date depuis « Mon compte » : rien n'est alors
prélevé, et tu gardes l'accès jusqu'au bout des sept jours.

En validant l'abonnement, tu demandes que l'accès commence immédiatement et tu renonces au droit de
rétractation de quatorze jours. Ton abonnement reste résiliable à tout moment, et l'accès reste
ouvert jusqu'à la fin de la période déjà payée.

## Abonnement, prix et TVA

Les prix sont hors TVA. La TVA est calculée au moment du paiement selon ton pays ; ton numéro de TVA
permet l'autoliquidation entre assujettis. En Belgique, le taux appliqué est de 21 %.

L'abonnement se prend au mois (39 € HTVA par mois) ou à l'année (390 € HTVA par an). Le mois est
sans engagement : il se résilie à tout moment depuis « Mon compte », et il reste actif jusqu'à la fin
de la période payée. L'année se renouvelle pour une nouvelle année, sauf si tu l'arrêtes avant
l'échéance — cet avis t'est envoyé au plus tard quinze jours avant la date limite pour t'y opposer,
et la résiliation reste possible à tout moment ensuite, sans frais. Le tarif fondateur est une
réduction de 10 € HTVA par mois, appliquée la première année aux comptes invités comme fondateurs,
dans la limite des places prévues ; ensuite, l'abonnement continue au tarif en vigueur. Le tarif
fondateur ne se transfère pas à un autre compte.

Le paiement est traité par Stripe : ta carte ne passe jamais par Braaise, et nous ne conservons
aucune donnée de carte.

Une facture récapitulative mensuelle est émise pour la période écoulée, au plus tard le 15 du mois
suivant. Les clients assujettis établis en Belgique reçoivent une facture électronique structurée
transmise par le réseau Peppol. Le reçu PDF envoyé par Stripe constate un paiement : ce n'est pas une
facture.

Toute modification de prix est annoncée au moins un mois à l'avance et s'applique à la reconduction
suivante, jamais à la période déjà payée.

## Ce que l'abonnement comprend

L'abonnement comprend une enveloppe mensuelle d'usage de l'assistant et des imports de fichiers.
Elle repart le 1er du mois et ne se reporte pas.

Quand l'enveloppe du mois est épuisée, l'assistant s'arrête : Braaise ne facture jamais un
dépassement sans ton accord. Deux issues : attendre le 1er du mois, ou acheter un pack de jetons.

Les packs sont des achats uniques qui s'ajoutent à l'abonnement : ils ne changent ni l'abonnement ni
son prix, et les jetons achetés n'expirent pas. Ton état de consommation est consultable à tout
moment dans Compte → Mon compte.

## Résilier

Tu peux résilier quand tu veux, depuis l'application : l'abonnement prend fin à l'échéance de la
période déjà payée. Aucun préavis, aucun justificatif. Les périodes entamées ne sont pas remboursées
au prorata, et les packs achetés restent acquis au compte jusqu'à épuisement.

À la fin du contrat, tes données restent lisibles pendant trente jours, puis le compte est fermé et
les données effacées. Les factures sont conservées sept ans, comme la loi le demande.

## Ce que tu t'engages à faire

Encoder des informations exactes, puisque Braaise calcule à partir de ce qu'il reçoit. N'envoyer un
bon, un mail ou un rappel qu'à des boutiques et contacts qui y consentent. Ne pas utiliser Braaise
pour un contenu illicite ou trompeur, ni pour du démarchage non sollicité. Ne pas contourner
l'authentification, le plafond d'usage ou les mesures de sécurité, ne pas extraire automatiquement
les données, ne pas revendre le service, ne pas le décompiler.

## Disponibilité et sauvegardes

Braaise est fourni en obligation de moyens : nous visons une disponibilité élevée, sans garantir de
taux, et sans engagement de niveau de service. Des interruptions restent possibles pour maintenance
ou mise à jour, faites quand c'est possible hors des heures d'atelier.

Les données sont sauvegardées chaque jour chez l'hébergeur. Une sauvegarde restaure l'état de la
veille, pas le dernier clic : garder une copie d'un bon signé reste utile.

Le service évolue : des écrans changent, des fonctions s'ajoutent ou disparaissent. Aucune fonction
précise n'est garantie pour toute la durée du contrat.

## Le bon de dépôt et la signature

Le bon de dépôt est une pièce entre toi et ta boutique. Braaise n'est pas partie au contrat de
dépôt : le mode de vente, les prix et les mentions sont ceux que tu as saisis.

La signature recueillie à l'écran est une signature électronique simple au sens du règlement eIDAS.
Elle est recevable comme preuve, avec un horodatage serveur et un PDF archivé — c'est l'usage courant
pour un bon entre commerçants. Braaise ne fournit pas de signature qualifiée et ne garantit pas
qu'elle résisterait à une contestation devant un juge.

Ce qui donne son sens au document (émetteur, boutique, mode de vente, prix) est figé au moment de
l'émission : modifier une fiche plus tard ne réécrit pas un document déjà signé.

## Responsabilité

Braaise répond des dommages directs causés par un manquement qui lui est imputable, dans la limite
des sommes que tu as effectivement payées au cours des douze mois précédents.

Braaise ne répond pas des dommages indirects : perte d'exploitation, perte de chiffre d'affaires,
manque à gagner, atteinte à l'image. Braaise ne répond pas non plus d'un dommage qui vient d'une
donnée inexacte ou non encodée, d'un envoi à un mauvais destinataire choisi par toi, d'un défaut de
réseau, de téléphone ou de boîte mail, ni d'une décision d'une boutique.

Les suggestions de l'assistant sont une aide à la décision : elles ne remplacent pas ton jugement.
Tu décides seul de ce que tu publies, envoies ou commandes.

## Données et confidentialité

Le traitement des données est décrit dans la politique de confidentialité, qui fait partie de ces
conditions. Pour les données de tes propres boutiques et contacts, Braaise agit comme
sous-traitant : c'est toi qui en es responsable. Un accord de sous-traitance est disponible sur
demande.

## Propriété

Braaise, son code, ses écrans et sa marque restent la propriété de l'éditeur. Tu disposes d'un droit
d'usage personnel, non exclusif et non transférable, pour la durée de ton abonnement.

Tes données restent les tiennes : fiches, produits, bons, PDF, historiques. Tu peux en demander une
copie à tout moment, et tu la reçois dans un format lisible (CSV, PDF) — y compris en fin de
contrat.

## Suspension

Braaise peut suspendre ou fermer un compte, en t'informant sauf urgence, en cas de non-paiement, de
contournement du plafond ou de la sécurité, d'usage illicite ou de manquement grave à ces
conditions.

## Modifications

Ces conditions peuvent être modifiées pour suivre le service ou la loi. Toute modification
importante est annoncée dans l'application au moins trente jours avant d'entrer en vigueur ; si tu
la refuses, tu peux résilier avant cette date, sans frais.

## Réclamations et droit applicable

Écris-nous d'abord à contact@braaise.io : nous répondons dans un délai de 10 jours ouvrables.
Si un compte est ouvert à un particulier et qu'aucun accord n'est trouvé, le Service de Médiation
pour le Consommateur (Boulevard du Roi Albert II 8, 1000 Bruxelles) est compétent.

Le contrat est soumis au droit belge. Les tribunaux de l'arrondissement de Bruxelles sont
compétents.

## Éditeur

Braaise est édité par Junior Silva Braga Almeida, indépendant à titre complémentaire (personne
physique), dont le siège est situé Rue Cardinal Lavigerie 7, 1040 Etterbeek, Belgique. Numéro
d'entreprise : 1043.060.596. Numéro de TVA : BE 1043.060.596 (assujetti au régime normal).
Contact : contact@braaise.io.

Dernière mise à jour : [DATE].`

export const CONFIDENTIALITE = `## En une phrase

Braaise garde le minimum nécessaire pour faire tourner ton atelier : ton compte, ce que tu encodes,
les documents que tu envoies. Pas de revente, pas de publicité, pas de traceur.

## Qui traite quoi

Braaise est responsable de traitement pour ton compte (adresse e-mail, mot de passe chiffré,
réglages), ton abonnement et sa facturation, la sécurité et les journaux techniques.

Braaise est sous-traitant pour les données de tes propres clients : tes boutiques, leurs contacts,
les dépôts qui les concernent, la signature recueillie sur un bon, les déclarations de vente. Ces
données sont là pour toi et sur ton instruction — c'est toi qui en es responsable. C'est donc à toi
de prévenir une boutique que tu notes ses coordonnées et qu'elle signe un bon ; Braaise ne les
utilise que pour te rendre le service.

Si tu as besoin d'un accord de sous-traitance pour tes propres obligations, écris-nous : il est
disponible sur demande.

## Ce qui est gardé, et pourquoi

- Adresse e-mail, mot de passe chiffré, réglages du compte : te donner accès au service. Conservés
  pendant la vie du compte, puis trente jours.
- Profil d'entreprise (nom, activité, adresse, délais) : remplir les bons, calculer les échéances.
  Même durée.
- Ce que tu encodes (produits, matières, recettes, commandes, marchés, planning) : c'est le service
  lui-même. Même durée.
- Boutiques et contacts (nom, e-mail, adresse, notes) : dépôts, relances, bons. Même durée.
- Bons de dépôt, PDF archivés et signature de la boutique : la pièce contractuelle et sa preuve.
  Même durée.
- Abonnements aux notifications (identifiant du navigateur) : t'envoyer une notification. Jusqu'à
  désactivation, ou trente jours après la fin du compte.
- Consommation de l'assistant (volume et coût technique) : compter l'enveloppe du mois, facturer
  juste. Douze mois.
- Facturation (nom, adresse, numéro de TVA, montants, identifiant Stripe) : obligation légale et
  comptable. Sept ans.
- Journaux techniques (adresse IP, horodatage, erreurs) : sécurité et diagnostic. Trente jours.

Aucune donnée de carte bancaire n'est conservée par Braaise : le paiement se fait sur une page
hébergée par Stripe, et Braaise ne voit que le résultat et un identifiant de client.

## L'assistant

Quand tu écris à l'assistant, ton message part chez le fournisseur du modèle de langage, accompagné
d'un résumé de ton contexte d'atelier (profil, planning, produits, boutiques, stock) et de tes vingt
derniers messages. Quand tu importes un fichier, c'est son contenu qui est envoyé.

À savoir, sans détour : le contenu de tes messages à l'assistant quitte l'Union européenne. Écris-lui
comme tu écrirais à un prestataire, et ne lui confie pas une donnée que tu ne confierais pas à un
outil externe.

## Ce qui n'est pas fait avec tes données

- pas de revente, pas de mise à disposition à des fins publicitaires
- pas de traceur publicitaire, pas de mesure d'audience tierce, pas de profilage
- pas d'utilisation de tes données pour entraîner un modèle : Braaise n'entraîne rien

## Où vont les données

- Supabase (base de données, authentification, fichiers) : hébergement dans l'Union européenne,
  région de Francfort.
- Vercel (site et application) : accès et journaux aux États-Unis.
- Stripe (Irlande) : le paiement et les données de facturation.
- Resend : l'envoi des e-mails (bons, invitations, notifications), avec le contenu du message et
  l'adresse du destinataire.
- Anthropic (États-Unis) : les messages envoyés à l'assistant et le contenu d'un fichier importé.
- OpenStreetMap (service public) : l'adresse encodée pour une boutique ou un itinéraire.
- OVH : le nom de domaine et les boîtes mail.

Les transferts hors Union européenne reposent sur les clauses contractuelles types de la Commission
européenne et sur les engagements de ces prestataires.

## Tes droits

Tu peux demander à consulter tes données, les corriger, les effacer, en obtenir une copie portable
(CSV, PDF), limiter ou refuser un traitement. Écris à contact@braaise.io : nous répondons dans les
trente jours.

Si ton compte est fermé, l'effacement se fait après le délai de trente jours, sauf ce que la loi
impose de conserver (les factures, sept ans).

Tu peux aussi introduire une réclamation auprès de l'Autorité de protection des données (Rue de la
Presse 35, 1000 Bruxelles).

Si tu es une boutique et que tu veux exercer un droit sur des données encodées par un artisan,
adresse-toi d'abord à l'artisan : c'est lui qui décide de ces données. Braaise l'assiste sur
demande.

## Sécurité

L'accès se fait par un compte nominatif, vérifié à chaque requête, et chaque donnée n'est lisible
que par son titulaire. Les bons archivés sont dans un espace privé, lisibles par un lien signé à
durée limitée. Sauvegardes quotidiennes, échanges chiffrés, secrets gardés côté serveur.

En cas de violation de données susceptible d'engendrer un risque élevé, les personnes concernées
sont informées et l'Autorité de protection des données est notifiée dans les soixante-douze heures.

## Modifications

Toute modification importante est annoncée dans l'application au moins trente jours avant d'entrer
en vigueur.

## Responsable du traitement

Junior Silva Braga Almeida — Rue Cardinal Lavigerie 7, 1040 Etterbeek, Belgique — numéro
d'entreprise 1043.060.596 — numéro de TVA BE 1043.060.596 (assujetti au régime normal).
Contact : contact@braaise.io.

Dernière mise à jour : [DATE].`
