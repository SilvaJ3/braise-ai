// Le texte des pages légales, gardé hors des écrans : c'est un document, pas de la mise en page.
//
// Format volontairement pauvre, pour que le rendu reste le même partout et que rien ne dépende
// d'un moteur de markdown : `## ` ouvre une section, `- ` une puce, le reste est un paragraphe.
// Le lecteur : `src/lib/texte-legal.ts` (pur, testé).
//
// ÉTAT : brouillons rédigés le 29/09/2026, identité de l'éditeur renseignée le 29/09 au soir.
//
// Statut vérifié le 06/10/2026, sur pièces :
//   - numéro d'entreprise 1043.060.596 : **actif** (extrait BCE du 01/10/2026, « situation normale ») ;
//   - identification à la TVA : **ACTIVE** — VIES confirme le numéro BE 1043.060.596 au nom de
//     Junior Silva Braga Almeida, le 06/10/2026 à 16h15. Le numéro est donc publié, et la TVA
//     belge (21 %) s'ajoute aux prix hors TVA.
//     (contrôle du 06/10/2026 08:43) ; **identification TVA confirmée par VIES le 06/10/2026 à 16h15**.
// Conséquence : la TVA belge (21 %) s'ajoute aux prix hors TVA affichés, et le numéro est publié
// dans les mentions légales et sur les factures. La version du 02/10 affirmait la TVA active un
// peu trop tôt ; celle du 06/10 au matin la disait en cours un peu trop tard. Celle-ci est datée.
//
// À FAIRE ensuite : la relecture juridique/comptable et la date de mise à jour. La page porte un
// bandeau provisoire tant qu'un crochet `[...]` subsiste.
//
// À VÉRIFIER AVANT PUBLICATION (faits que ce texte affirme et que le code ne prouve pas) :
//   - l'accord de sous-traitance art. 28.4 lie bien chaque prestataire de la liste (DPA accepté ou
//     signé chez Supabase, Vercel, Stripe, Resend, Anthropic, OVH) ;
//   - le mécanisme de transfert écrit pour chacun (cadre UE–États-Unis ou clauses types) : contrôlé
//     contre la liste officielle du cadre et contre leur DPA, pas seulement de mémoire ;
//   - la déclaration professionnelle de « Qui peut s'abonner » est réellement recueillie par l'écran de
//     souscription et par `stripe-checkout` (au 06/10/2026 le code demande encore la renonciation
//     à la rétractation et ne recueille aucune déclaration : écart à fermer côté paiement) ;
//   - le délai de trente jours pour annoncer un changement de sous-traitant — **validé par JSB le
//     06/10/2026**, ce n'est plus un choix de rédaction.
// Les numéros d'article belges suivis de « à confirmer » ne sont pas vérifiés à la source.
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

## Qui peut s'abonner

Braaise est réservé aux professionnels : indépendants, sociétés, associations qui exercent une
activité. Tu souscris pour les besoins de ton activité professionnelle, et non à titre privé.

Le droit de rétractation de quatorze jours que le Code de droit économique réserve au consommateur
(art. VI.47 et suivants, à confirmer) ne s'applique pas aux contrats conclus entre professionnels. Le
consommateur est la personne physique qui agit à des fins étrangères à son activité professionnelle
(art. I.1 du même code, à confirmer) : si c'est ton cas, Braaise n'est pas fait pour toi, et tu ne
dois pas t'abonner.

En souscrivant, tu déclares agir pour les besoins de ton activité professionnelle. Cette déclaration
est recueillie à la souscription.

## Comptes boutique

Une boutique reçoit les dépôts des artisans : elle signe les bons, suit les articles qu'elle détient
et voit ce qui s'est vendu. Ce compte distinct de l'atelier et obéit aux mêmes règles de personne
morale : il est réservé aux professionnels, et le droit de rétractation ne s'y applique pas plus
qu'à l'artisan.

**Prix.** L'abonnement boutique est de 49 € HTVA par mois. Il commence par un essai de quatorze
jours : la carte est demandée à l'entrée, aucun prélèvement n'a lieu avant la fin de l'essai, et tu
es prévenu deux jours avant, puis la veille. Tu arrêtes quand tu veux depuis « Mon compte » : rien
n'est alors prélevé, et tu gardes l'accès jusqu'au bout des quatorze jours.

**Accompagnement au démarrage.** Braaise comprend deux opérations d'import réalisées par nos soins :
nous reprenons tes produits ou tes artisans depuis ton fichier existant et nous les encodons à ta
place, jusqu'à deux fois. Au-delà, l'import reste disponible dans l'outil et c'est toi qui le
lances — nous restons joignables si quelque chose bloque. Ce qui suit la mise en route (les
nouveaux articles, les corrections, les fichiers suivants) se fait depuis l'application.

**Cumul avec un abonnement artisan.** Si tu es aussi artisan et que tu paies déjà l'abonnement
atelier, l'abonnement boutique est facturé 25 € HTVA par mois au lieu de 49 €, tant que les deux
abonnements sont actifs sur le même compte.

**Ce que la boutique ne paie pas.** La boutique ne paie pas pour les artisans qu'elle reçoit : ce
sont eux qui s'abonnent à Braaise pour tenir leur atelier. Un artisan qui n'a pas d'abonnement
continue d'apparaître sur les bons que la boutique signe.

Le reste des présentes conditions s'applique au compte boutique : l'essai, la TVA, la résiliation,
la responsabilité et le traitement des données.

## L'essai

L'essai dure sept jours et s'ouvre en enregistrant un moyen de paiement : la carte est demandée à
l'entrée, aucun prélèvement n'a lieu avant la fin de l'essai, et tu es prévenu deux jours avant, puis
la veille. Tu peux arrêter l'abonnement avant cette date depuis « Mon compte » : rien n'est alors
prélevé, et tu gardes l'accès jusqu'au bout des sept jours.

L'abonnement reste résiliable à tout moment depuis « Mon compte », et l'accès reste ouvert jusqu'à
la fin de la période déjà payée.

## Abonnement, prix et TVA

Les prix sont indiqués hors TVA. La TVA belge au taux en vigueur (actuellement 21 %) s'ajoute
lorsqu'elle est due, selon ton pays et ta qualité. Si tu es assujetti établi dans un autre État membre,
ton numéro de TVA permet l'autoliquidation. Les factures portent le numéro de TVA de l'éditeur
(BE 1043.060.596) et sont conservées dix ans.

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
les données effacées. Les factures sont conservées dix ans, durée que la réglementation TVA impose
aux documents comptables.

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
des sommes que tu as effectivement payées au cours des douze mois précédents, avec un minimum de
500 €. Cette limite ne s'applique pas en cas de dol ou de faute lourde de Braaise, ni pour les
dommages que la loi ne permet pas de limiter.

Braaise ne répond pas des dommages indirects : perte d'exploitation, perte de chiffre d'affaires,
manque à gagner, atteinte à l'image. Braaise ne répond pas non plus d'un dommage qui vient d'une
donnée inexacte ou non encodée, d'un envoi à un mauvais destinataire choisi par toi, d'un défaut de
réseau, de téléphone ou de boîte mail, ni d'une décision d'une boutique.

Les suggestions de l'assistant sont une aide à la décision : elles ne remplacent pas ton jugement.
Tu décides seul de ce que tu publies, envoies ou commandes.

## Données et confidentialité

Le traitement des données est décrit dans la politique de confidentialité, qui fait partie de ces
conditions. Pour les données de tes propres boutiques et contacts, Braaise agit comme
sous-traitant : c'est toi qui en es responsable. L'accord de sous-traitance exigé par l'article 28.3
du RGPD est intégré à la politique de confidentialité (section « Accord de sous-traitance »), qui fait
partie de ces conditions : il te lie à Braaise dès que tu acceptes ces conditions, sans autre
formalité.

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
Le contrat est conclu entre professionnels. Si un litige n'est pas résolu à l'amiable, il relève des
juridictions compétentes pour les litiges entre entreprises.

Le contrat est soumis au droit belge. Les tribunaux de l'entreprise de Bruxelles, division
francophone, sont compétents.

## Éditeur

Braaise est édité par Junior Silva Braga Almeida, indépendant à titre complémentaire (personne
physique), dont le siège est situé Rue Cardinal Lavigerie 7, 1040 Etterbeek, Belgique. Numéro
d'entreprise : 1043.060.596. Numéro de TVA : BE 1043.060.596 (identification confirmée par VIES le
6 octobre 2026).
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

L'accord de sous-traitance que l'article 28.3 du RGPD exige entre un responsable et son
sous-traitant n'est pas à demander : il est écrit plus bas, dans la section « Accord de
sous-traitance », et il te lie à Braaise dès que tu acceptes les conditions.

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

## Sur quelle base

Chaque traitement repose sur une base légale de l'article 6 du RGPD, indiquée ici comme l'exige
l'article 13.1.c :

- Ton compte, ton profil, ce que tu encodes, tes boutiques, tes bons et l'assistant : pour tes propres
  données, l'exécution du contrat (art. 6.1.b). Pour les données de tes clients, Braaise agit sur ton
  instruction (art. 28.3.a) : la base légale de ce traitement est la tienne, puisque tu en es
  responsable.
- L'abonnement et la facturation : l'exécution du contrat (art. 6.1.b), et l'obligation légale
  comptable et fiscale pour les factures (art. 6.1.c).
- Les journaux techniques et la sécurité : l'intérêt légitime de Braaise à garder le service sûr
  (art. 6.1.f). Tu peux t'y opposer : voir « Tes droits ».
- Les notifications : ton consentement (art. 6.1.a), que tu peux retirer à tout moment : voir « Tes
  droits ».
- La consommation de l'assistant : l'exécution du contrat (art. 6.1.b), et l'intérêt légitime de
  facturer juste (art. 6.1.f).

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

Voici les sous-traitants de Braaise, ce que chacun fait, où, et sur quel mécanisme repose un éventuel
transfert hors Union européenne (art. 44 à 46 du RGPD). Un transfert hors Union se fait soit vers un
pays reconnu adéquat (art. 45, par exemple le cadre de protection des données UE–États-Unis pour un
prestataire certifié), soit avec les clauses contractuelles types de la Commission (art. 46.2.c).

- Supabase Inc. : base de données, authentification, fichiers. Les données sont hébergées à Francfort
  (Union européenne). Un accès depuis les États-Unis, par exemple pour du support, reposerait sur les
  clauses contractuelles types de son accord de traitement (à confirmer).
- Vercel Inc. : site et application. États-Unis (accès et journaux). Cadre de protection des données
  UE–États-Unis, par la certification du prestataire (à confirmer), et à défaut les clauses
  contractuelles types.
- Stripe Payments Europe, Ltd. : paiement et facturation. Irlande (Union européenne). Stripe agit pour
  Braaise comme sous-traitant du paiement, et pour ses propres obligations (lutte contre la fraude et
  le blanchiment) comme responsable de traitement (à confirmer). Les transferts vers Stripe Inc.
  (États-Unis) reposent sur le cadre UE–États-Unis ou les clauses types (à confirmer).
- Resend (Plus Five Five, Inc.) : envoi des e-mails (bons, invitations, notifications), avec le contenu
  du message et l'adresse du destinataire. États-Unis. Clauses contractuelles types de son accord de
  traitement (à confirmer ; la certification au cadre UE–États-Unis n'est pas vérifiée).
- Anthropic PBC : l'assistant, avec les messages envoyés et le contenu d'un fichier importé.
  États-Unis. Clauses contractuelles types de son accord de traitement (à confirmer ; la certification
  au cadre UE–États-Unis n'est pas vérifiée).
- OVH SAS : nom de domaine et boîtes mail. France (Union européenne) : aucun transfert hors Union.
- OpenStreetMap (service public Nominatim) : l'adresse encodée pour une boutique ou un itinéraire,
  sans nom ni e-mail. Service public sans contrat avec Braaise ; pays et mécanisme de transfert à
  confirmer.

## Accord de sous-traitance

Pour les données de tes clients (tes boutiques, leurs contacts, les dépôts, les signatures, les
déclarations de vente), tu es responsable de traitement et Braaise est ton sous-traitant. Cette
section est l'accord que l'article 28.3 du RGPD exige. Il fait partie des conditions et s'applique
pendant toute la durée de ton abonnement.

- Objet et nature : stocker, afficher, calculer, archiver et envoyer ces données pour te rendre le
  service décrit dans les conditions, et rien d'autre.
- Données et personnes concernées : nom, adresse, e-mail, notes, signature et horodatage des
  boutiques et de leurs contacts, produits déposés.
- Instructions : Braaise ne traite ces données que sur tes instructions documentées, c'est-à-dire
  les conditions et ton usage de l'application (art. 28.3.a). Si une instruction lui paraît violer
  le RGPD, il t'en informe immédiatement (art. 28.3, dernier alinéa).
- Confidentialité : les personnes autorisées à traiter ces données sont tenues à la confidentialité
  (art. 28.3.b).
- Sécurité : Braaise applique les mesures décrites dans « Sécurité » (art. 28.3.c et 32).
- Sous-traitants ultérieurs : ceux de la liste ci-dessus, aux conditions de la section suivante
  (art. 28.3.d, 28.2 et 28.4). Braaise leur impose les mêmes obligations de protection que celles de
  cet accord (art. 28.4) et reste responsable envers toi de leur exécution.
- Droits des personnes : Braaise t'aide, par des mesures techniques adaptées, à répondre aux
  demandes d'accès, de rectification, d'effacement et aux autres droits (art. 28.3.e). Une boutique
  qui s'adresse à Braaise est renvoyée vers toi.
- Violation, analyse d'impact : Braaise t'aide à respecter les articles 32 à 36, et t'informe en cas
  de violation comme décrit dans « Sécurité » (art. 28.3.f).
- Fin du contrat : tu choisis la restitution (copie CSV, PDF) ou l'effacement ; à défaut, tes données
  restent lisibles trente jours puis sont effacées, sauf ce que la loi impose de conserver
  (art. 28.3.g).
- Contrôle : Braaise met à ta disposition les informations nécessaires pour démontrer le respect de
  ces obligations et permet les audits que tu demandes avec un préavis raisonnable (art. 28.3.h).

## Quand un sous-traitant change

Tu autorises de façon générale Braaise à recourir aux sous-traitants de la liste (art. 28.2). Avant
d'en ajouter ou d'en remplacer un, Braaise t'en informe dans l'application ou par e-mail, au moins
trente jours avant, avec son nom, son rôle et son pays.

Tu peux t'opposer à ce changement, par écrit à contact@braaise.io, pendant ces trente jours et pour des
raisons tenant à la protection de tes données (art. 28.2). Braaise cherche alors une solution avec
toi. Si aucune n'est possible, tu peux résilier sans frais avant l'entrée en vigueur du changement.

## Tes droits

Tu peux demander à consulter tes données (art. 15), les corriger (art. 16), les effacer (art. 17),
en limiter le traitement (art. 18) et en obtenir une copie portable, CSV ou PDF (art. 20). Écris à
contact@braaise.io : nous répondons dans le mois (art. 12.3).

Tu peux retirer ton consentement à tout moment (art. 7.3), aussi simplement que tu l'as donné : pour
les notifications, désactive-les depuis Compte → Notifications, ou écris-nous. Le retrait n'efface pas
ce qui s'est fait avant.

Tu as le droit de t'opposer, pour des raisons tenant à ta situation particulière, à un traitement fondé
sur l'intérêt légitime de Braaise, comme les journaux techniques (art. 21.1). Écris-nous : Braaise
cesse ce traitement, sauf s'il démontre des motifs légitimes impérieux ou si la loi l'impose.

Si ton compte est fermé, l'effacement se fait après le délai de trente jours, sauf ce que la loi
impose de conserver (les factures, dix ans).

Tu peux aussi introduire une réclamation auprès de l'Autorité de protection des données (Rue de la
Presse 35, 1000 Bruxelles).

## Si tu es une boutique

Un artisan a noté tes coordonnées ou t'a fait signer un bon de dépôt sur Braaise : tu es une
personne concernée, et cette section t'informe au moment où tes données sont collectées (art. 13 du
RGPD).

- Responsable du traitement : l'artisan dont le nom figure sur le bon. Braaise, édité par Junior Silva
  Braga Almeida (contact@braaise.io), est son sous-traitant : il traite tes données pour le compte de
  l'artisan.
- Données : ton nom et tes coordonnées, les produits déposés, ta signature à l'écran, la date et
  l'heure de la signature.
- Pourquoi, et sur quelle base : établir et prouver le bon de dépôt et suivre ta relation avec
  l'artisan. La base est choisie par l'artisan, en principe l'exécution du contrat de dépôt
  (art. 6.1.b).
- Qui les reçoit : l'artisan, Braaise et les sous-traitants listés dans « Où vont les données ».
- Combien de temps : celui que fixe l'artisan. Chez Braaise, tant que son compte est ouvert, puis
  trente jours.
- Tes droits : accès, rectification, effacement, limitation, portabilité, opposition (art. 15 à 21).
  Adresse-toi d'abord à l'artisan, qui décide de ces données ; Braaise l'assiste sur demande
  (art. 28.3.e). Tu peux aussi écrire à contact@braaise.io.
- Réclamation : auprès de l'Autorité de protection des données, comme indiqué plus bas.

## Sécurité

L'accès se fait par un compte nominatif, vérifié à chaque requête, et chaque donnée n'est lisible
que par son titulaire. Les bons archivés sont dans un espace privé, lisibles par un lien signé à
durée limitée. Sauvegardes quotidiennes, échanges chiffrés, secrets gardés côté serveur.

Violation de données. Pour les données dont Braaise est responsable (ton compte, ton abonnement), il
notifie l'Autorité de protection des données dans les soixante-douze heures après en avoir pris
connaissance, sauf si la violation n'engendre pas de risque (art. 33.1), et informe les personnes
concernées quand le risque est élevé (art. 34). Pour les données de tes clients, dont tu es
responsable, Braaise t'informe dans les meilleurs délais après en avoir pris connaissance
(art. 33.2), avec ce qu'il sait de la nature de la violation, des données touchées et des mesures
prises, pour que tu puisses faire tes propres notifications dans le délai de soixante-douze heures
(art. 33.1).

## Modifications

Toute modification importante est annoncée dans l'application au moins trente jours avant d'entrer
en vigueur.

## Responsable du traitement

Junior Silva Braga Almeida — Rue Cardinal Lavigerie 7, 1040 Etterbeek, Belgique — numéro
d'entreprise 1043.060.596 — numéro de TVA BE 1043.060.596.
Contact : contact@braaise.io.

Dernière mise à jour : [DATE].`


export const MENTIONS = `## Éditeur du site

Braaise est édité par Junior Silva Braga Almeida, personne physique, indépendant à titre
complémentaire.

- Adresse : Rue Cardinal Lavigerie 7, 1040 Etterbeek, Belgique
- Numéro d'entreprise (BCE) : 1043.060.596
- Contact : contact@braaise.io
- Responsable de la publication : Junior Silva Braga Almeida, en qualité d'éditeur

Ces mentions sont publiées en application de l'article XII.6 du Code de droit économique, qui
impose à un prestataire de services en ligne de donner son nom, son adresse, son adresse e-mail et
son numéro d'entreprise (à confirmer).

## TVA

L'éditeur est identifié à la TVA sous le numéro BE 1043.060.596, confirmé par VIES le 6 octobre 2026.
Le numéro figure sur les factures. Les prix affichés sont hors TVA ; la TVA belge au taux en vigueur
(21 % à ce jour) s'y ajoute pour les clients particuliers et les assujettis établis en Belgique. Les
assujettis établis dans un autre État membre ne paient pas la TVA belge : ils indiquent leur numéro de
TVA et l'autoliquidation s'applique. Voir « Abonnement, prix et TVA » dans les conditions générales.

## Ce que couvrent ces mentions

Le site de présentation braaise.io, l'application artisan.braaise.io et les pages des boutiques de
braaise.io/boutique.

## Hébergement

- Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis (vercel.com) : site et
  application.
- Supabase Inc., [adresse de Supabase à confirmer] (supabase.com) : données et bases, hébergées à
  Francfort, dans l'Union européenne.
- OVH SAS, 2 rue Kellermann, 59100 Roubaix, France (ovh.com) : nom de domaine et boîtes mail.

## Autres prestataires

- Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin, Irlande (stripe.com) : paiements.
- Resend (Plus Five Five, Inc.), [adresse de Resend à confirmer] (resend.com) : envoi des e-mails.
- Anthropic PBC, 548 Market St, San Francisco, États-Unis (anthropic.com) : l'assistant.

Ce que chacun reçoit, dans quel pays et sur quel mécanisme : voir la politique de confidentialité.

## Propriété intellectuelle

Le nom Braaise, le logo, les textes du site et le code de l'application sont protégés. Toute
reproduction sans autorisation est interdite. Les marques et logos de tiers éventuellement cités
appartiennent à leurs titulaires.

Les données encodées par les utilisateurs (fiches produits, boutiques, bons, fichiers importés) leur
appartiennent : voir « Propriété » dans les conditions générales.

## Données personnelles et cookies

Voir la politique de confidentialité. Le site n'utilise aucun cookie publicitaire ni de mesure
d'audience. Seul est posé ce qui est strictement nécessaire au fonctionnement, la session de
connexion, qui n'appelle pas de consentement (loi du 13 juin 2005 relative aux communications
électroniques, art. 129, à confirmer). La page de paiement est hébergée par Stripe, qui applique sa
propre politique.

Dernière mise à jour : [DATE].`
