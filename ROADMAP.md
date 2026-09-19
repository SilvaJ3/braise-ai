# Braaise — Roadmap (ce qu'il reste à faire)

Référence produit : `specs/spec-app-au-coin-du-feu.md` et `specs/vision-assistant-virtuel.md`
(hors repo, dans `files.zip`). Test à appliquer à chaque feature avant de la coder :
*ça la décharge, ou ça lui ajoute une tâche ?*

## État

| Version | État |
|---|---|
| V1 — Planning réseaux sociaux + rappels au login | Fait, déployé (https://braise-ai.vercel.app) |
| V1.5 — Notifications push PWA | Fait (+ date/heure/rappel par entrée, auto-planification, fix mise à jour du service worker) |
| V7 — Couche IA assistant | Démarrée en avance : chat d'idées (historique persistant, réponse en arrière-plan + notification push), bilan hebdo (cron lundi, tous les comptes), voix de marque éditable, catalogue produits, retour « ça a marché ? », recherche web dans le chat, boutiques (V2) branchées sur `buildContext` + suggestion `relance_boutique`. Reste à brancher sur V3. |
| V2 — CRM boutiques | Fait : tables `boutiques`/`boutique_contacts_log`, écran liste + fiche (mobile), lien `content_entries.boutique_id`, suggestion `relance_boutique` (calcul déterministe, seuil 21 j, cron hebdo). |
| V3 — Atelier | **Fait** : tables `fournisseurs`, `matieres_premieres`, `produit_recettes` (BOM, UI dans Compte → Mes bougies → Recette), écran « Atelier » (Matières / À commander / Commandées / Fournisseurs / Importer), **import universel par IA**, `commandes`/`commande_lignes` (boutique et perso, statuts demande→confirmée→en prod→livrée), calcul du besoin matière en temps réel, `commandes_fournisseur`/`commande_fournisseur_lignes` (statuts à commander→commandée→reçue, réception qui incrémente le stock automatiquement), suggestion `alerte_stock` + stock dans le contexte de l'assistant. |
| V4 — Bon de dépôt signé + envoi mail | **Fait** (voir plus bas). Le contrat cadre (13 articles) reste hors app : signé une fois par boutique, sur papier. |
| V5, V6, V8 | Pas commencés |

## Chantier MVP — ouvrir à d'autres artisans

Découpage en tranches livrables (voir `PROSPECTION.md` côté pilotage) :

| Tranche | État |
|---|---|
| T1 — Profil de compte neutre (plus de « Alexandra / bougies » codé en dur) | Fait, déployé |
| T2 — Inscription sur invitation (code, compte créé côté serveur) | Fait, déployé |
| T3 — Tunnel d'accueil (activité, lieu, catalogue de départ) | Fait, déployé |
| T4 — Accueil vide propre + libellés génériques | Fait, déployé |
| T5 — Plan, quota mensuel inclus, journalisation des tokens | Fait, déployé |
| T5 bis — Encaissement Stripe + conditions générales | **Pas commencé — zéro ligne de code** (vérifié le 19/09 : aucun fichier de `src/` ne mentionne Stripe). Ce qui bloque, c'est **encaisser** : le numéro BCE, et un **compte Stripe dédié à Braaise** (la facturation doit être à sa structure). Le mode **test** ne bloque rien : page de prix, Checkout, abonnement, échec de paiement, webhook se développent et se vérifient sans vérification d'entreprise — la bascule en production se limite ensuite à la vérification et à l'échange des clés. |
| T6 — Carte « Pour démarrer » sur l'accueil (étapes lues dans les données) | **Fait, déployé** — vérifié en production le 19/09 : la carte s'affiche sur l'accueil, `assistant_profil.demarrage_ferme_at` est en base (migration 0042 appliquée). 193 tests. |
| Entrée par le site — demande d'accès → invitation → inscription | **Fait, déployé le 19/09.** Formulaire sur braaise.io, table `demandes_acces`, validation par un tap depuis le mail, page `/acces` sur le site (Supabase ne peut pas servir de HTML : sa passerelle réécrit en `text/plain`), code et adresse pré-remplis à l'inscription. Parcours testé de bout en bout. |
| **Places de fondateur bornées** | **Correctif écrit et testé le 19/09 — reste à appliquer.** La migration `0048_places_fondateur.sql` fait compter les places dans la fonction qui crée l'invitation (le seul endroit où la décision est atomique) : une place est prise par une invitation fondateur utilisée ou encore valable, une invitation expirée jamais utilisée la rend. Au-delà de dix, l'invitation part en tarif mensuel. **Deux des dix places sont déjà prises** (deux invitations de test utilisées). Vérifié par test transactionnel : plafond atteint → mensuel ; place libérée → fondateur ; place prise → mensuel ; mensuel demandé → jamais rétrogradé. Rien n'est appliqué en base tant que l'ordre n'est pas donné. |
| **Écran « Demandes d'accès » dans l'app** | **À faire.** Aucun écran ne liste les invitations ni les demandes d'accès — la validation passe uniquement par le mail. |
| **Installation PWA et notifications** (T8) | **À faire.** Comment se connecter, comment activer les notifications, comment ajouter Braaise à l'écran d'accueil. À ne pas confondre avec T7 : **T7 explique l'app, T8 explique comment l'installer.** |

**Tarifs — décidés le 19/09/2026**, prix **HTVA** (un artisan assujetti récupère la TVA ; en
franchise il paie 21 % de plus) :

- **Fondateur : 29 €/mois**, prix bloqué **2 ans**, pour les **10 premiers** comptes.
- **Mensuel : 39 €/mois** ensuite.
- **Annuel : 390 €/an** *(proposition, à confirmer)* — à 290 €/an il aurait été moins cher que le
  tarif fondateur.

Ils vivent dans `_shared/compte.ts` (`PLANS`) et s'affichent dans « Mon compte ». **Reste à faire
avant d'encaisser** : borner réellement les places de fondateur — aujourd'hui une invitation créée
depuis le site donne toujours le plan `fondateur`, sans compter.

## T5 bis — encaissement Stripe : ce qui est fait, et le découpage

**Côté Stripe (mode test, créé le 19/09/2026 — compte `acct_1UHLjJHJnfqhoXjC`, Belgique, euros) :**

- Produit `Braaise` — `prod_VHvoji5vLJcTGG`
- Prix **mensuel 39 € HTVA** — `price_1UHLwkHJnfqhoXjCmkP0Zt5w`
- Prix **annuel 390 € HTVA** — `price_1UHLwkHJnfqhoXjCYPnjlN2o`
- Coupon **fondateur −10 € pendant 24 mois** — `BYfhMZY2` → **29 € effectifs** sur le prix de 39 €,
  et le tarif remonte tout seul à 39 € au terme des deux ans. Vérifié en relisant le coupon depuis
  Stripe, pas en le supposant.
- La clé secrète de test vit dans `.env.local` (ignoré par git, vérifié). **La clé publique n'est pas
  nécessaire** : le Checkout est hébergé par Stripe, tout passe par le serveur.

**Le découpage, dans l'ordre :**

1. ✅ **La fonction de paiement** (`stripe-checkout`) — **faite et vérifiée le 19/09**, déployée.
2. ✅ **La fonction de retour** (`stripe-webhook`) — **faite et vérifiée le 19/09**, déployée
   (`--no-verify-jwt`, la signature Stripe fait office d'authentification).
3. ⏳ **L'écran d'abonnement** dans `Mon compte` — le bouton, l'état réel et le portail Stripe.
4. ⏳ **Les tests** — les cas moches (carte refusée, impayé, résiliation).
5. ⏳ **La bascule** (seule étape bloquée par le n° BCE).

**Ce qui a été vérifié, pas supposé** (19/09, mode test) :

- un compte `fondateur` qui clique « S'abonner » obtient une session dont le **sous-total est 39 € et
  le total à payer 29 €** — le coupon s'applique tout seul (relevé sur la session Stripe :
  `amount_subtotal 3900`, `amount_total 2900`) ;
- le webhook **écrit bien sur le compte** : statut `actif`, `abonnement_prix_centimes 2900`, fin de
  période et identifiant d'abonnement enregistrés ;
- une **signature falsifiée est refusée** (HTTP 400) ;
- le compte est rattaché à son client Stripe au premier paiement.

**Ce qui reste de ton côté — 2 minutes, et c'est le seul point bloquant :** mon jeton n'a pas le droit
d'écrire les secrets du projet (lecture seule). Il faut donc les poser une fois dans le tableau de
Supabase (`Project Settings` → `Edge Functions` → `Secrets`) :

- `STRIPE_SECRET_KEY` — ta clé de test, celle qui est déjà dans `.env.local` ;
- `STRIPE_PRIX_MENSUEL` = `price_1UHLwkHJnfqhoXjCmkP0Zt5w` ;
- `STRIPE_PRIX_ANNUEL` = `price_1UHLwkHJnfqhoXjCYPnjlN2o` ;
- `STRIPE_COUPON_FONDATEUR` = `BYfhMZY2` ;
- `STRIPE_WEBHOOK_SECRET` — il est **déjà dans ton `.env.local`** (ligne `STRIPE_WEBHOOK_SECRET=…`),
  tu la copies de là.

*(Variante : tu réautorises le connecteur avec la permission `edge_functions_secrets`, et je les pose
moi-même — dis-le moi et je te guide en trois clics.)*

Tant qu'on reste en mode test, **rien ne circule** : uniquement des cartes de test.

## Ce qui n'attend que toi (tout le reste est côté développement)

| Quoi | Pourquoi c'est toi, et pas le code |
|---|---|
| **Le numéro BCE** | Le seul vrai blocage de Stripe : sans lui, pas d'encaissement. |
| **Un compte Stripe dédié à Braaise** | La facturation doit être à ta structure, pas à celle d'un tiers. |
| **Une ligne DNS chez OVH** | `_dmarc.braaise.io` est **absent** (vérifié le 19/09). Première étape, en surveillance seule : `TXT @ _dmarc.braaise.io` = `v=DMARC1; p=none; rua=mailto:contact@braaise.io; fo=1` — on passe à `quarantine` quand les rapports sont propres, jamais avant. |
| **L'adresse e-mail d'Alexandra** | Pour lui ouvrir son compte du mini-CMS. |
| **Deux décisions** | Fusionner la branche `cms-pilote` en production (le site d'Au Coin du Feu) ? Publier le dépôt `mini-cms` sur ton GitHub ? |
| **Ouvrir la préproduction du CMS** | La branche `cms-pilote` est déployée en aperçu (derrière le login de l'équipe Vercel). Rien n'est en production. |

Le **mini-CMS** (photos éditables pour les vitrines clients) vit hors de ce dépôt : schéma, règles
d'accès et les 12 emplacements d'Au Coin du Feu posés dans le projet Supabase existant le 19/09
(**zéro euro de plus** — un projet dédié coûterait ~9 €/mois, le calcul est facturé par projet), site
câblé par repli local, page d'édition et rapport mensuel restant à faire.

## Onboarding de premier usage (décision, T6 fait / T7 à faire)

Deux choses distinctes, souvent confondues :

1. **Le tunnel de profil** (T3, déployé) : trois écrans à l'inscription, il remplit
   `assistant_profil` pour que l'assistant ne soit pas vague. Il est bien tel quel.
2. **Le premier usage** : ce que la personne fait dans les cinq minutes qui suivent. Le tunnel se
   terminait sur « Commencer à la main » → écran vide, sans rien pour dire quoi faire. C'est ce
   trou que comble T6.

**Décision : pas de visite guidée des fonctionnalités.** Un spotlight sur les onglets enseigne le
planning à quelqu'un qui n'a rien à planifier, coûte cher à maintenir (ciblage, repositionnement,
accessibilité, à refaire à chaque refonte d'écran) et se fait traverser en quatre taps sans laisser
de trace. Ce qu'on fait à la place :

- **T6 — carte « Pour démarrer »** (`src/components/Demarrage.tsx`, `src/lib/demarrage-etapes.ts`) :
  trois lignes maximum, chacune menant au bon écran, dans l'ordre des dépendances réelles —
  une boutique, les produits, puis **le premier bon signé** (l'étape qui montre la pièce maîtresse,
  débloquée seulement quand il y a de quoi remplir un bon), le planning en dernier. Chaque ligne
  disparaît quand la donnée existe, la carte s'efface à la dernière. Le masquage est enregistré sur
  le compte (`assistant_profil.demarrage_ferme_at`, migration 0042) : un changement de téléphone ne
  la fait pas revenir. Journalisation : `demarrage_vu` / `demarrage_clic` / `demarrage_masque` /
  `demarrage_termine`, une ligne par situation et par session.
  Effet de bord bienvenu : l'accueil ne charge plus le catalogue ni le planning en entier pour
  savoir s'il est vide — quatre comptages côté serveur (`head: true`) suffisent.
- **T7 — à faire** : aide contextuelle à deux endroits seulement (le canvas de signature, le
  geste de vente de l'onglet Marché), une seule fois, vue stockée côté serveur — et une page
  « Premiers pas » rouvrable depuis Compte. Plus l'amorçage du chat par trois puces cliquables,
  qui vaut mieux qu'un écran de présentation.

Test à appliquer avant d'ajouter quoi que ce soit ici : *est-ce que ça la décharge, ou est-ce que
ça lui ajoute une tâche ?* Une carte qui reste affichée après avoir été fermée ajoute une tâche.

## Écart assumé vs spec

La spec prévoit que V7 (IA) ne démarre qu'après V1–V4. L'assistant a été pris en avance
parce qu'il apporte de la valeur immédiate sur le planning seul. Conséquence : aujourd'hui
il raisonne uniquement sur le planning + le catalogue. Sa pleine valeur (relances boutiques,
alertes stock) attend V2 et V3.

## Architecture multi-utilisateurs

Aujourd'hui l'app sert un seul compte (Alexandra). Objectif possible à terme : ouvrir à
d'autres artisans si Junior commercialise l'outil. Le garde-fou de la spec reste valable —
**ne pas généraliser prématurément** (config flexible par artisan, multi-seat, facturation)
tant que l'usage réel n'a pas validé l'outil. Mais l'ossature doit rester compatible.

**Déjà multi-tenant (à préserver, coût nul) :**

- Chaque table porte `user_id` + une policy RLS `user_id = auth.uid()`. L'isolation des
  données est acquise : ajouter un utilisateur = ajouter un compte auth, rien d'autre.
- Supabase Auth gère N utilisateurs nativement.
- `assistant_profil` et `produits` sont déjà par utilisateur → la voix de marque et le
  catalogue de chaque artisan seraient isolés.
- L'edge function `assistant` est déjà paramétrée par `userId` (`buildContext(userId)`).

**Règle pour V2–V7 :** toute nouvelle table = `user_id not null` + RLS `user_id = auth.uid()`
dès la migration. Jamais de table sans RLS. C'est 90 % du multi-tenant, gratuit si fait
d'emblée, coûteux à rétrofiter.

**Raccourcis mono-utilisateur assumés (à lever quand un 2ᵉ compte réel arrive) :**

- Cron hebdo : ✅ corrigé — `handleWeekly` boucle sur tous les comptes (`listUsers`, cap 50).
  Au-delà de ~50 comptes, passer en fan-out (1 invocation edge / user).
- `DEFAULT_PROFIL` code en dur « Alexandra » et « bougies » — OK comme fallback, mais un vrai
  produit a besoin d'un onboarding qui remplit `assistant_profil` à l'inscription.
- ~~Pas de flux d'inscription~~ → **fait (T2)** : inscription sur invitation (`/inscription` +
  edge function `inscription` + table `invitations`). L'inscription publique reste **fermée** :
  le code est le seul chemin, et il est vérifié côté serveur. Le tunnel d'accueil (T3) est fait
  aussi : il remplit `assistant_profil` avant d'ouvrir le reste de l'app.
- Branding « Braaise » figé (manifest, titre, icônes). Un produit multi-artisan
  demanderait un nom générique ou du white-label.
- Push crons (`push-reminders`, `push-weekly-digest`) : vérifier qu'ils balaient bien tous
  les utilisateurs et pas un seul, au moment d'ouvrir à d'autres.

**À NE PAS construire maintenant :** inscription self-service (l'invitation reste le seul
chemin), panneau admin, white-label, gestion d'équipe.

> **Mis à jour le 19/09/2026.** Cette liste datait d'avant le chantier MVP, et elle le
> contredisait : le chantier a précisément construit l'inscription sur invitation (T2) et les
> plans + quotas (T5), donc la commercialisation est devenue une décision prise. Ce qui reste
> hors périmètre est la liste ci-dessus, moins l'inscription sur invitation et la facturation.

---

## Phase 0 — test d'usage (aucun code)

Alexandra utilise V1 + V1.5 + assistant en réel. Suivi via la table `app_events` :

```sql
select name, count(*), max(created_at) from app_events group by name;
```

On ajuste wording / design / rappels selon ce qui coince. Rien d'autre ne démarre avant ce retour.

## Reliquat court (au fil du retour, pas un chantier)

- **Import CSV produits — UI.** ✅ Fait, en plus général : voir « Import universel » ci-dessous
  (Atelier → Importer, entité « Bougies », dédoublonnage sur `shopify_handle` puis nom).
- **Sync API Shopify.** App custom Shopify (token Admin API permanent, pas d'OAuth),
  edge function `sync-shopify`, bouton « Synchroniser depuis Shopify ». ~1 jour.
  À faire quand la boutique est live et le catalogue stable.
- ~~**Connexion Instagram / réseaux sociaux.**~~ **Retiré le 16/09** : l'intégration (deux edge
  functions, deux tables, quatre colonnes, un bucket, un cron) tournait en production sans aucune
  source dans ce dépôt. Supprimée plutôt que rapatriée — voir la section dédiée plus bas pour la
  reprise éventuelle.
- **Infos atelier / lieu.** Rien à coder : Alexandra le renseigne dans le textarea « Voix de marque ».

---

## V2 — CRM boutiques

- Tables `boutiques`, `boutique_contacts_log`.
- Fiches boutique : nom, adresse, horaires (jsonb), canal de contact préféré, email / tél, notes.
- Log de contact manuel : date, canal, résumé.
- Lien `boutiques` ↔ `content_entries` (quelle publication pour quelle boutique).
- Écran liste + fiche, mobile.
- **Assistant** : nouvelle suggestion `relance_boutique` — « [Boutique] : pas de contact
  depuis X semaines » (seuil à caler avec Alexandra).

## Import universel (V3, fait)

Un seul écran (Atelier → Importer) pour charger un fichier dans n'importe quelle entité :
bougies, matières premières, fournisseurs, boutiques.

- **Formats** : xlsx / xlsm / csv / tsv / txt / json / pdf / photo (png, jpg, webp). 6 Mo max, 500 lignes max. Pas de .xls / .ods / .numbers (enregistrer en .xlsx ou .csv).
- **Pipeline** : le client envoie le fichier en base64 à l'edge function `import` → tableur
  converti en CSV texte (lecteur xlsx maison `_shared/xlsx-lite.ts`, sans dépendance : le bundler Supabase refuse le CDN SheetJS et `npm:xlsx` 0.18 a deux CVE), PDF/image passés tels quels à Claude → Claude (Sonnet) renvoie
  les lignes typées via un outil dont le schéma est généré depuis la définition de l'entité
  (`supabase/functions/_shared/import-entities.ts`) → chaque ligne repasse par `normalizeRow`
  (types, bornes, enums, troncature) → aperçu côté client avec plan **nouveau / mise à jour /
  identique** contre l'existant → l'utilisatrice coche/décoche et confirme → insert/update via RLS.
- **Secours sans IA** : si Anthropic est indisponible (ou clé absente), lecture déterministe par
  en-têtes de colonnes (synonymes FR/EN/Shopify) pour les CSV et tableurs ; côté client aussi
  pour les CSV si le serveur ne répond pas.
- **Règles** : jamais d'écrasement d'une valeur existante par du vide ; l'unité d'une matière
  existante n'est pas modifiée par un import ; les fournisseurs cités par les matières sont créés
  s'ils n'existent pas ; doublons internes au fichier fusionnés (première occurrence).
- **Coût** : ~1 à 5 centimes par fichier (Sonnet, quelques milliers de tokens).
- **Limites connues** : pas d'édition cellule par cellule dans l'aperçu (on corrige après
  import via les fiches) ; pas d'import de recettes/BOM ni d'historique de contacts.

## V3 — Catalogue + matières premières + fournisseurs + commandes (fait)

Le gros morceau. Cœur métier : « il me faut X bougies pour telle boutique → il me faut Y
matière première → il faut commander chez Z ». Chaîne complète, bout en bout.

- ✅ `produit_recettes` (BOM : matière + quantité par unité produit), UI dans Compte → Mes
  bougies → Recette.
- ✅ `matieres_premieres` : stock actuel, seuil d'alerte, catégorie, unité, prix unitaire, fournisseur lié.
- ✅ `fournisseurs` : délai de livraison, contact, site.
- ✅ Écran Atelier (onglets Matières / À commander / Commandées / Fournisseurs / Importer).
- ✅ `commandes` + `commande_lignes` (type boutique ou personne) : statut demande → confirmée →
  en prod → livrée. Une ligne peut être marquée « déjà en stock » (sort du calcul de besoin).
- ✅ **Calcul du besoin matière** (`useBesoinsMatiere`, temps réel côté client) :
  somme(qté commandée × qté matière par recette) sur les commandes actives, comparé au
  `stock_actuel` → écart = quantité à commander, groupé par fournisseur.
- ✅ `commandes_fournisseur` + `commande_fournisseur_lignes` : créées depuis Atelier → À
  commander (bouton « Commander » par fournisseur, lignes pré-remplies depuis le besoin
  calculé) ; statut à commander → commandée → reçue. Le passage à « reçue » incrémente
  `stock_actuel` des matières automatiquement (trigger DB, un seul déclenchement par transition).
- ✅ **Assistant** : suggestion `alerte_stock` (déterministe, stock ≤ seuil, une par matière,
  cron hebdo) + stock/seuils/fournisseurs dans `buildContext`.

**Limite connue assumée** : la liste « À commander » ne sait pas qu'une commande fournisseur
est déjà en cours pour une matière (elle reste affichée tant que le stock n'a pas bougé, donc
tant que la commande n'est pas reçue) — pas de statut « déjà commandé » visible directement
dans ce tableau. Le détail vit dans l'onglet Commandées. Pas de quantité reçue différente de
la quantité commandée (reçu = commandé, ajustement de stock à la main sinon).

## V4 — Bon de dépôt signé + envoi par mail (fait)

Calqué sur le bon papier existant : en-tête émetteur, bloc « information point de vente »,
tableau articles / qté / prix TTC, renvoi aux conditions générales du contrat, date + signature.

- **Écran** : fiche boutique → « Bons de dépôt » → *Nouveau*. Articles ajoutés **un par un**
  depuis le catalogue (ou en saisie libre) ; rien n'est pré-rempli, la liste reste courte.
- **Signature** tactile (canvas), exportée en JPEG ; elle survit à un redimensionnement
  (ouverture du clavier, rotation) — le tracé est redessiné après coup.
- **PDF** généré côté serveur par un générateur maison (`_shared/pdf-lite.ts` : Helvetica,
  encodage WinAnsi, images JPEG, multi-pages). Pas de dépendance : le bundler Supabase refuse
  les CDN et `npm:pdf-lib` serait disproportionné. Sortie validée en test par relecture pdf.js.
- **Mail** : envoyé par le **service de l'app** (Resend sur le domaine `braaise.io`), pièce
  jointe PDF, destinataire pré-rempli avec le contact de la boutique et modifiable, copie à
  l'artisane. Expéditeur fixe `no-reply@braaise.io` (même adresse pour tous les comptes),
  `Reply-To` vers son adresse pour que les réponses lui reviennent. Aucun réglage technique
  demandé à l'utilisateur — c'est la raison de ce choix plutôt qu'une connexion à sa propre
  boîte. Voir README → « Envoi des mails ».
- **Archivage** : bucket Storage privé `depots`, chemin `<user_id>/<depot_id>.pdf`, relu par
  URL signée (1 h).
- **Numérotation** : `AAAA-NNN`, attribuée à la signature, jamais réutilisée.
- **Reprise sur échec** : si l'envoi tombe, le bon reste signé et numéroté ; il se relance
  sans refaire signer la boutique.
- **Données figées** : nom / adresse / mail de la boutique sont recopiés dans le bon au moment
  du dépôt, pour que le document reste fidèle si la fiche change ensuite.

**Point juridique à trancher (non bloquant).** La signature tactile est une *signature
électronique simple* au sens eIDAS : recevable comme preuve, mais contestable — la charge de
prouver son intégrité revient à l'artisane. Pour un bon de dépôt B2B entre commerçants, c'est
l'usage courant et suffisant en pratique. Ce qui la renforce déjà ici : horodatage serveur,
PDF archivé, copie envoyée aux deux parties le jour même. Aller plus loin (itsme, signature
qualifiée) serait un chantier à part. **À confirmer avec un juriste avant tout litige : cette
note n'est pas un avis juridique.**

### Reste à faire sur V4

- Lien avec les futures `commandes_boutique` (V3) : aujourd'hui le bon est autonome.
- Décompte mensuel / facturation (articles 4 et 12 du contrat) : hors périmètre pour l'instant.
- Le contrat cadre lui-même n'est pas dans l'app (décision assumée).
- **Prérequis avant le premier envoi réel** : compte Resend + clé API. Le domaine peut
  attendre : avec `MAIL_DOMAIN=resend.dev`, tout se teste depuis le bac à sable de Resend
  (envoi limité à l'adresse du titulaire du compte).
- Option écartée pour l'instant : connexion OAuth à la boîte Gmail de l'utilisateur (le mail
  partirait de sa vraie adresse, mais Google impose une validation de plusieurs semaines pour
  ce droit, et la connexion casse tous les 7 jours avant validation).

## Chantier identifié — planches d'inspiration (non décidé)

**D'où ça vient.** Une tatoueuse a expliqué à Alexandra sa galère : le planning des réseaux
sociaux, les idées, et **les planches d'inspiration** pour ses tatouages (ses idées + des exemples,
type Pinterest). Elle est pressentie comme bêta testeuse. Rencontre prévue le 29/09/2026.

**Ce qui existe pour elle aujourd'hui** : le planning (V1) et le chat (V7) couvrent sa première
galère. **Ce qui n'existe pas** : rien ne porte une image ni une référence — `content_entries` a un
titre, une plateforme, une date et un champ `notes` libre ; les colonnes d'image ont été retirées
avec l'Instagram (0039).

**Attention : on ne connaît pas son raisonnement.** JSB le dit très bien (17/09) — « on fonce dans un
mur si je pense connaître son propre raisonnement pour la recherche d'inspiration de planche ».
Personne ici n'a jamais cherché une planche de tatouage : sa forme (ce qu'elle collecte, comment
elle trie, si elle s'inspire ou détourne, si elle montre la planche au client) n'est pas devinable
depuis un bureau.

**Donc aucune table n'est décidée.** L'estimation technique ci-dessous n'est qu'un **ordre de
grandeur, valable si son raisonnement s'avère simple** : deux tables (`planches` + ses références),
un bucket Storage privé par compte (même modèle que `depots`), un écran, la planche lue dans
`buildContext` → **1,5 à 2 jours**. Pas d'API Pinterest utilisable : son geste restera coller un lien
ou déposer une capture. Si son processus est plus retors (tri complexe, allers-retours client,
réutilisation de ses propres planches), c'est un autre produit, et il vaut mieux le découvrir avant.

**Ce qu'on fait le 29/09 : on observe, on ne spécifie pas.** Grille d'observation :
`~/projets-clients/prospection/beta/2026-09-29-grille-planche.md` — lui faire montrer son dernier
vrai cas, noter ses mots, ne rien proposer, ne promettre aucun écran. Le reste de la rencontre porte
sur ce qui existe et qui marche déjà pour elle : réseaux sociaux, chat, planning.

**Un prototype existe depuis le 17/09** — `~/projets-clients/proto-tatoueuse/` (fichier unique, quatre
écrans, hors ligne, aucune donnée réelle). Le planning et le chat y sont tels qu'ils existent ; la
planche y est traitée **comme une question** : une bannière le dit, et sous un exemple de planche il
y a les six questions de la grille, avec un bouton qui met les réponses en texte prêt à envoyer.
Les écrans dépôt / boutiques / stock / commandes en sont **absents** — ils ne la concernent pas.

**Ce prototype ne décide rien** : aucune table, aucune migration, aucun écran validé. Il sert à faire
réagir, pas à spécifier. Ordre imposé le 29 : **son dernier vrai tatouage d'abord** (raconté et montré
par elle), le prototype ensuite, présenté comme une hypothèse.

**Question de fond, non tranchée** : Braaise sert-il deux vocations — le papier de l'atelier
(dépôts, stock, commandes) *et* l'inspiration du créatif (planning, planches) ? Les deux restent
dans la doctrine (« ce qui tourne autour de la création », jamais la gestion). Ne rien figer avant
d'avoir trois personnes comme elle.

## V5 — Intégration Gmail (reporté, le plus lourd)

- OAuth Gmail (par boutique ou global).
- Parsing des mails liés à une boutique (commande / facture / relance).
- **À trancher avant de coder** : quels mails, quelle rétention (vie privée).

## V6 — Maps / itinéraires

- Table `itineraires` (arrêts en jsonb).
- Réutilise les circuits de prospection existants (Namur 7 arrêts, Bruxelles Centre /
  Dansaert + Ixelles).
- Lien boutiques ↔ itinéraire, ouverture du trajet via un lien Google Maps (pas de moteur
  de routing custom).
- Petit module.

## V7 — Couche IA assistant, complétion

Déjà en place : chat, bilan hebdo, catalogue, retours perf, recherche web, écran « Aujourd'hui ».
Reste, à mesure que V2 et V3 arrivent :

- Nourrir `buildContext()` (edge function `assistant`) avec les boutiques (V2) et le
  stock / commandes (V3).
- Suggestions `relance_boutique` + `alerte_stock`.
- Enrichir l'écran « Aujourd'hui » avec ces types de suggestions.

## V8 — Distribution App Store natif (optionnel)

- Seulement si la PWA montre ses limites après validation de tout le reste.
- Wrapper natif (Capacitor ou React Native), compte Apple Developer (99 $/an), revue Apple.

---

## Connexion aux réseaux sociaux (Instagram / Facebook / TikTok) — **retirée le 16/09**

Le prototype V2.5 (OAuth Instagram, publication directe et programmée) a été **supprimé de la
production** le 16/09 sur décision explicite. Raison : il tournait sans source versionnée — les
migrations `0025_instagram`, `0026_instagram_cron`, `0027_oauth_states_user_idx` et les edge
functions `instagram-oauth` / `instagram-publish` n'ont jamais existé dans ce dépôt. Rien
d'auditable, rien de reconstructible après un `db reset`, et un jeton de publication stocké pour
un service qui ne s'en servait plus.

Ce qui a été retiré, et comment : migration `0039_retrait_instagram.sql` (cron, politiques
Storage, quatre colonnes de `content_entries`, tables `instagram_accounts` et `oauth_states`),
puis le bucket `content-media` et les deux fonctions par l'API. Aucune donnée perdue : tout était
vide (relevé avant). **Reste à faire à la main** : les secrets `META_APP_ID` / `META_APP_SECRET`
dans Project Settings → Edge Functions → Secrets (le jeton OAuth de l'outillage n'a pas le droit
de les supprimer).

Le code des fonctions est archivé hors dépôt, dans
`~/projets-clients/braise-instagram-archive/` (corps servi par l'API, source lisible par
recherche de marqueurs). C'est la seule copie existante. L'app Meta, côté Facebook, peut être
supprimée séparément si tu n'en as plus besoin.

**Si l'idée revient**, ne pas repartir du prototype : tout réécrire dans le dépôt. Les notes
ci-dessous restent valables pour cadrer l'effort.

Question ouverte, si on la reprenait : brancher directement le compte Instagram d'Alexandra.

### Ce qui existe (à reconfirmer au moment du dev — l'écosystème Meta bouge souvent)

- **Instagram Graph API** (via Meta Graph API) — pour comptes professionnels (Business ou
  Creator). Historiquement liée à une Page Facebook ; depuis 2024 une variante « Instagram
  API with Instagram Login » permet de connecter un compte Creator/Business sans Page FB.
  - Lecture des médias publiés, des commentaires, des messages.
  - **Insights / statistiques** : portée, vues, interactions, abonnés, métriques par publication.
  - **Content Publishing API** : publier photos, vidéos, reels, carrousels, stories
    (stories : comptes Business). Le média doit être accessible via une URL publique
    (donc hébergement d'images à prévoir). Limite ~50 publications / 24 h.
- **Instagram Basic Display API** — **supprimée le 4 décembre 2024**. Ne pas compter dessus.
- **Facebook** : même Graph API, via les Pages.
- **TikTok** : Content Posting API + Display API, friction de revue comparable.

### Friction

- Créer une app Meta, implémenter le flux OAuth, gérer les jetons (longue durée ~60 jours,
  à rafraîchir).
- **App Review Meta + vérification Business** obligatoire pour dépasser son propre compte.
  Pour un seul compte (celui d'Alexandra), on peut rester en mode développement avec son
  compte ajouté comme testeur, ou passer la revue.
- Pour publier : hébergement public des images/vidéos à prévoir (Supabase Storage).
- Estimation : semaines, pas jours.

### Tranches de valeur, de la plus légère à la plus lourde

1. **Lecture des insights (read-only).** Remplir automatiquement le retour « ça a marché ? »
   avec les vrais chiffres de portée au lieu de demander à Alexandra de taper carton / ok /
   bof. Décharge réelle. Pas d'hébergement média nécessaire.
2. **Lecture des médias publiés.** Savoir ce qu'elle a réellement posté, rapprocher du planning.
3. **Publication depuis l'app.** Pousser une publication planifiée directement sur Instagram.
   Gros gain UX mais tranche la plus lourde (revue + hébergement média + fenêtres de publication).

### Placement

À traiter comme une version dédiée (par exemple « V2.5 — Connexion Instagram »), après le
retour d'usage. Commencer par la tranche 1 (insights read-only) si le retour montre que le
suivi manuel des perfs est une corvée.

---

## Audit de robustesse (septembre 2026) — ce qui a été durci

- **Chat muet (trouvé le 16/09)** : le corps de la requête était lu deux fois (`Deno.serve` pour
  connaître `mode`, puis `handleChat`). Un `Request` ne se relit pas : la seconde lecture levait,
  le `.catch(() => ({}))` la transformait en « message vide », et **toutes** les questions
  recevaient un `400`. Le corps est désormais lu une seule fois et passé aux fonctions qui en ont
  besoin. Le dernier échange réussi datait du 29/08 — personne ne l'avait vu parce que rien ne
  testait le chemin authentifié.
- **Chat bloqué** : une réponse `pending` orpheline (edge function tuée avant d'écrire) bloquait
  la saisie pour toujours. Désormais clôturée en erreur après 5 min, côté serveur et côté client.
- **Rappels push** : réservation atomique (`update … where reminder_sent_at is null` avant
  envoi) → plus de double envoi si deux crons se chevauchent ; rappels de plus de 24 h marqués
  sans notifier.
- **Anthropic** : timeout + retry (429/5xx/réseau) partagé (`_shared/anthropic.ts`) ; limites
  de taille (message 4000 car., titre 300, réponse 20 000) ; anti-spam du bouton « Générer des
  idées » (10 min).
- **DB** : policies RLS en `(select auth.uid())` (advisor Supabase, évalué une fois par
  requête), index FK manquants, contraintes de longueur (`not valid`, sans re-scan).
- **Front** : ErrorBoundary (plus d'écran blanc muet), date locale (`ymd`) au lieu de
  `toISOString` (bug entre minuit et 2 h), couleurs du thème validées avant injection CSS,
  géocodage sans exception (timeout 10 s), historique de chat limité à 100 messages, retour
  visuel du test push, notification qui navigue vers la bonne page.
- **Outillage** : vitest (parseur CSV, normalisation, mapping, dates, thème), `npm run check`,
  workflow GitHub Actions (lint + tests + build).

**À faire à la main côté Supabase (pas migrable)** :
- Authentication → Password → activer *Leaked password protection* (advisor).
- Extension `pg_net` dans `public` (advisor, faible impact ; déplacer = recréer les crons).

## Coûts récurrents

Prix indicatifs ~début 2026, à reconfirmer. Le développement est une dépense ponctuelle,
non incluse ici.

| Poste | Gratuit possible | Payant | Choix retenu |
|---|---|---|---|
| **Supabase** (DB, Auth, Storage, edge functions, cron) | Oui (0 €) | Pro **25 $/mois** | **Pro.** Le tier gratuit met le projet en pause après 7 j d'inactivité et n'a aucune sauvegarde — inacceptable pour un outil dont Alexandra dépend (rappels, crons). |
| **Hébergement front** (le PWA) | 0 € possible (Cloudflare Pages, usage commercial autorisé) | Vercel Pro **20 $/mois** | **Vercel Pro — déjà payé** pour l'ensemble des projets (Braaise et les vitrines clients). Vercel facture **par siège, pas par projet** : ajouter un site ne coûte rien. Cloudflare Pages reste la sortie si un site dépasse le téraoctet inclus. |
| **API Claude** (assistant : chat + bilan hebdo) | Non (à l'usage) | ~**2 à 10 €/mois** | Modèle **Sonnet** partout (chat + hebdo). Cron hebdo ≈ 0,20 €/mois. Chat ≈ 2-8 €/mois selon l'usage. Web search : 10 $ / 1000 recherches. |
| **API Instagram / Meta** | **Oui (0 €)** | — | Graph API gratuite, pas d'abonnement. Coût = temps de dev uniquement. |
| **Push notifications** | **Oui (0 €)** | — | Web Push (VAPID), pas de frais APNs/FCM. |
| **Nom de domaine** (`braaise.io`) | — | **~35-60 €/an** pour un `.io` (un `.be` ≈ 10 €/an, un `.app` ≈ 15 €/an) | Sert d'expéditeur aux bons de dépôt (`alias@braaise.io`) et de vitrine. Le `.io` est l'extension la plus chère du lot — à arbitrer. |
| **Resend** (envoi des bons de dépôt) | **Oui (0 €)** — 3000 mails/mois, 100/jour | 20 $/mois au-delà | **Gratuit.** Quelques bons par mois, très loin du plafond. |
| **Compte Apple Developer** | — | 99 $/an (~8 $/mois) | **Seulement si V8 natif.** Pas maintenant. |

**Totaux :**

- **Version minimale** (Supabase gratuit, Cloudflare, chat Sonnet) : ≈ **3-6 €/mois**.
  Risque : pause du projet, pas de backup.
- **Version recommandée** (Supabase Pro + Cloudflare + Sonnet + domaine) : ≈ **30-35 €/mois**.
- **Version confort** (+ Vercel Pro au lieu de Cloudflare) : ≈ **50-55 €/mois**.

La partie Instagram n'ajoute **rien** au récurrent (juste du stockage d'images si tranche 3 :
~150 Mo/mois, négligeable dans le quota Supabase Pro).

Seul poste vraiment incompressible dès qu'Alexandra dépend de l'outil : **Supabase Pro
25 $/mois**.

**Relevé le 19/09/2026** sur les factures : Vercel Pro 21,81 €/mois et Supabase Pro 22,50 €/mois,
soit **44,31 €/mois** — et **zéro heure** d'exploitation. C'est exactement ce qu'un serveur à soi
devrait remplacer ; il coûterait 212 €/mois une fois les 4 h de maintenance comptées (le seuil est de
**38 minutes par mois**, au-delà le serveur coûte plus cher). Le seul vrai levier d'économie est un
**projet Supabase unique** pour tous les clients : le calcul est facturé **par projet** (le crédit de
10 $ inclus n'en couvre qu'un). Détail et sources : `HEBERGEMENT-SERVEUR-VS-ABONNEMENTS.md`.

### Maintenance (temps, pas abonnement)

- Meta déprécie ~1-2 fois/an un endpoint → 2-4 h pour bumper la version.
- Mises à jour dépendances + patchs sécurité : quelques heures/trimestre.
- Corrections de bugs remontés par l'usage réel.
- Surveillance des crons (refresh token, push, bilan hebdo).

Auto-maintenu : ~2-4 h/mois en moyenne, avec des pics sur les dépréciations Meta.
Sous-traité : ~150-400 €/trimestre selon l'activité.

### Si commercialisation (plusieurs artisans)

- Supabase Pro tient largement plusieurs dizaines de comptes (8 Go DB, 100 Go storage).
  Passage au tier supérieur ($599/mois Team) seulement à grande échelle.
- Coût Claude : linéaire par utilisateur actif (~2-8 €/mois/artisan sur le chat). À
  répercuter dans le prix de l'abonnement.
- Ces coûts deviennent un vrai sujet de pricing — hors scope tant que la décision de
  commercialiser n'est pas prise.
