# Prompt à donner à Claude Code — brainstorming Braaise boutique (abonnement 49 €)

**Consigné le 04/10/2026, profil `default`. Écrit pour être collé tel quel à Claude Code, ou lu
par lui s'il va le chercher.** Rien n'est codé, aucun commit, aucune migration, aucun déploiement,
aucun envoi à un tiers.

**Comment l'utiliser :** ouvre Claude Code sur un worktree dédié de `braise-ai` et donne-lui ce
fichier en entier comme consigne. Le travail attendu est un **avis critique argumenté**, pas du
code. Le seul livrable est une réponse en six points (A à F).

---

## Contexte

Braaise (repo `SilvaJ3/braise-ai`, app artisan + espace boutique). La version boutique payante vient
d'être tranchée. **Avant d'écrire une ligne, je veux ton regard critique sur les décisions**, pas un
plan de code.

**TRAVAIL EN LECTURE SEULE ABSOLUE.** Aucun commit, aucune migration, aucun déploiement, aucune
écriture de fichier. Tu produis un avis argumenté, point par point. Tu contredis si tu apportes un
**fait**.

---

## Ce qui est acté — à ne rediscuter que sur un fait contraire

1. **Braaise ne fait ni comptabilité, ni factures, ni TVA, ni déclarations.** Doctrine intacte
   (`BRAISE-POSITIONNEMENT.md`) : aucune ligne à changer.
2. **Le Dashboard Concept Store est une EXTENSION NON OBLIGATOIRE** de Braaise boutique. Colonne TVA
   par produit, optionnelle, **par catégorie avec héritage et surcharge par produit**, sur le modèle
   de saisie de Loyverse. Éteinte pour **Lära** (dépôt-vente), allumée pour **Haut les cœurs**
   (fleuriste, achat ferme).
3. **L'outil ne facture pas** et ne remplace aucun outil de facturation.
4. **Le taux de TVA n'est jamais imposé** : l'utilisateur configure les siens. Aucun taux par défaut,
   aucun taux pré-rempli.
5. **Version boutique payante** : un compte qui **centralise** (au lieu d'un lien par artisan), un seul
   prix **49 € HTVA/mois**, un tarif **annuel** (montant non décidé), et **l'accès offert jusqu'à une
   date** pour les trois mois offerts — **jamais un essai Stripe avec carte**, qui prélève.
6. **Le planning de réassort est la fonctionnalité qui justifie le prix.** Mécanisme décidé :
   - aujourd'hui l'artisan reçoit une demande avec une **échéance calculée d'office** (son délai
     habituel, 2 semaines par défaut) ; la boutique ne peut pas proposer de date, et l'artisan ne peut
     répondre qu'en avançant le statut de la commande. **C'est ce trou que le planning comble** ;
   - la boutique demande **avec une date** → l'artisan accepte, la déplace, ou **impose un délai**
     depuis son app ;
   - **la date retenue par l'artisan fait foi** et s'affiche en premier chez la boutique ; la date
     demandée reste en second ;
   - l'artisan peut **modifier après coup** ; la boutique est prévenue à chaque changement et voit
     **l'historique** (date demandée, puis chaque date retenue). Sans ça, « la date engage » ne veut
     rien dire ;
   - une **date passée est refusée** ; deux demandes d'une même boutique s'affichent **côte à côte** ;
   - **sans réponse**, la demande reste « en attente », **aucun délai inventé**, aucun statut avancé
     d'office ;
   - la boutique peut envoyer un **rappel** : geste manuel, **limité et tracé** (l'artisan voit combien
     il en a reçu et quand) ;
   - la **pause de l'artisan est déclarée par lui** (début et fin), **jamais déduite d'une inactivité** ;
     ses propositions sont grisées chez la boutique avec sa date de retour ; la boutique peut laisser
     une demande qui reste en attente jusqu'au retour ;
   - **rien ne dépend d'une notification** : l'envoi s'arrête après 5 tentatives, donc les demandes en
     attente doivent se voir à l'ouverture de l'app ;
   - `boutique_commander` (0068) porte déjà la mécanique et notifie l'artisan **par push ET mail** ;
     il manque l'écran.
7. **PARK, étroit et motivé** : l'automatisme à date fixe (commande récurrente), parce que le besoin
   dépend du moment de l'année.
8. **Chat généraliste ÉCARTÉ.** Assistant de réassort **GO mais NON PRIORITAIRE**.
9. **Programme d'apporteuse d'affaires** (Lara : 600 € payés, 100 € par boutique et 50 € par artisan
   qui restent 6 mois, plafond 600 €) : **EN DISCUSSION, non validé**. Rien à promettre tant que
   l'invitation ne fonctionne pas réellement.

---

## Ce qui est demandé, dans cet ordre

**A. ATTAQUE LA DÉCISION 6.** La mécanique ci-dessus est déjà écrite en détail : cherche les cas
qu'elle ne couvre pas (modification après réponse de l'artisan, déplacement vers une date passée,
demandes qui se chevauchent, artisan en pause qui répond quand même, ce qu'on trace du rappel et
pendant combien de temps). Si un cas tombe dans le vide, dis-le.

**B. ATTAQUE LA VALEUR RÉELLE.** La boutique gratuite (par lien) fait déjà presque tout. Écris, une
phrase par ligne, ce que l'abonnement apporte **QUE le lien ne peut pas donner**. Si une ligne est
faible, dis-le — c'est le point le plus important de ton avis. Le document de discussion avec Lara
propose quatre pistes : boîte « à faire » unique, calendrier unique des réassorts, déclaration
mensuelle en une séance, et un « état de ce que tu dois à chaque artisan ». **Cette quatrième piste
frôle la comptabilité** : est-elle défendable sans contredire la doctrine, ou faut-il la retirer ?

**C. LA LITE ET LA FULL DANS LA MÊME PAGE.** La vitrine `/store` décrit la version lite (« ni compte à
créer ni abonnement à souscrire ») : juste, mais **pour la lite seulement**. Comment présenter les deux
côte à côte sans que la lite paraisse un piège ni la full une pression ? Le lien ne se ferme jamais.
**Interdit** : l'état d'avancement du chantier sur une page publique.

**D. LES CGU NE CONNAISSENT QUE L'ARTISAN.** Aujourd'hui : « un compte par artisan », « tes
boutiques », prix 39/390 €. Avec une boutique cliente **payante**, il manque son tarif, son essai, sa
TVA, sa case d'acceptation (`conditions_acceptees_le` n'existe que côté artisan). Et **Braaise passe de
sous-traitant à responsable de traitement** pour les données de la boutique. Est-ce que j'oublie une
obligation ?

**E. LE PROGRAMME D'APPORTEUSE.** Cherche la faille : qui compte comme « nouveau client », un
remboursement après versement, la TVA et le statut de Lara, ce qui se passe si elle amène une de ses
propres boutiques, et si ça entre en conflit avec le fait que **l'artisan est celui qui paie Braaise**.

**F. LE CALENDRIER, sans heures.** Ce qui est **bloquant avant le premier encaissement**, et ce qui
peut attendre. Chemin qui compte : rattacher un compte à un lien (aujourd'hui **fait à la main en
SQL**) → modèle d'abonnement → règles d'accès → écran « Mon abonnement » → les trois gestes manquants
(**déclarer, contester, historique**).

---

## Interdits

Écrire dans le dépôt, lancer une migration, déployer, envoyer un mail, **inventer un prix ou une
date**, promettre une fonctionnalité non livrée à un client.

## Format attendu

Une réponse courte par point (A à F), chaque affirmation appuyée sur un fichier ou une ligne du dépôt
quand c'est possible. **Finis par les trois questions que je dois trancher** avant de lancer Claude
Code sur du code.

## Cadre d'exécution

- Un **worktree dédié**, jamais l'arbre principal (il porte du travail non commité).
- Un seul objet d'échange : ce document. Tu le contredis, tu ne le réécris pas.
- Trois tours maximum (Claude critique → Hermes répond → verdict), puis JSB tranche.
