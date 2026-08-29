# Au Coin du Feu — Roadmap (ce qu'il reste à faire)

Référence produit : `specs/spec-app-au-coin-du-feu.md` et `specs/vision-assistant-virtuel.md`
(hors repo, dans `files.zip`). Test à appliquer à chaque feature avant de la coder :
*ça la décharge, ou ça lui ajoute une tâche ?*

## État

| Version | État |
|---|---|
| V1 — Planning réseaux sociaux + rappels au login | Fait, déployé (https://braise-ai.vercel.app) |
| V1.5 — Notifications push PWA | Fait (+ date/heure/rappel par entrée, auto-planification, fix mise à jour du service worker) |
| V7 — Couche IA assistant | Démarrée en avance : chat d'idées (historique persistant, réponse en arrière-plan + notification push), bilan hebdo (cron lundi, tous les comptes), voix de marque éditable, catalogue produits, retour « ça a marché ? », recherche web dans le chat. Reste à brancher sur V2/V3. |
| V2, V3, V4, V5, V6, V8 | Pas commencés |

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
- Pas de flux d'inscription (désactivé volontairement). À rouvrir + écran onboarding le jour
  de la commercialisation.
- Branding « Au Coin du Feu » figé (manifest, titre, icônes). Un produit multi-artisan
  demanderait un nom générique ou du white-label.
- Push crons (`push-reminders`, `push-weekly-digest`) : vérifier qu'ils balaient bien tous
  les utilisateurs et pas un seul, au moment d'ouvrir à d'autres.

**À NE PAS construire maintenant :** inscription self-service, onboarding, facturation /
plans / quotas, panneau admin, white-label, gestion d'équipe. YAGNI tant que la
commercialisation n'est pas une décision prise.

---

## Phase 0 — test d'usage (aucun code)

Alexandra utilise V1 + V1.5 + assistant en réel. Suivi via la table `app_events` :

```sql
select name, count(*), max(created_at) from app_events group by name;
```

On ajuste wording / design / rappels selon ce qui coince. Rien d'autre ne démarre avant ce retour.

## Reliquat court (au fil du retour, pas un chantier)

- **Import CSV produits — UI.** Bouton dans « Ce qu'il sait », `papaparse`, mappage des
  colonnes, upsert sur `produits.shopify_handle` (colonne déjà en place). ~½ jour.
  Le catalogue actuel (4 bougies) est déjà importé en base, donc pas urgent.
- **Sync API Shopify.** App custom Shopify (token Admin API permanent, pas d'OAuth),
  edge function `sync-shopify`, bouton « Synchroniser depuis Shopify ». ~1 jour.
  À faire quand la boutique est live et le catalogue stable.
- **Connexion Instagram / réseaux sociaux.** Voir section dédiée plus bas — c'est un vrai
  chantier (app Meta + OAuth + App Review), pas un reliquat court. À planifier comme une
  version à part.
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

## V3 — Catalogue + matières premières + fournisseurs + commandes

Le gros morceau. Cœur métier : « il me faut X bougies pour telle boutique → il me faut Y
matière première → il faut commander chez Z ».

- Étendre `produits` : recette / BOM (`produit_recette` : matière + quantité par unité produit).
- `matieres_premieres` : stock actuel, seuil d'alerte, fournisseur lié.
- `fournisseurs` : délai de livraison, contact.
- `commandes_boutique` + `commande_lignes` : statut demande → confirmée → en prod → livrée.
- **Calcul du besoin matière** : somme(qté produit commandé × qté matière par recette),
  groupé par matière, comparé au `stock_actuel` → écart = quantité à commander par fournisseur.
- `commandes_fournisseur` générées depuis cet écart (statut à commander → commandée → reçue).
- **Assistant** : suggestion `alerte_stock` — « Cire sous seuil, délai fournisseur 5j,
  commande maintenant ».

## V4 — Dépôt / livraison + signature

- Formulaire de dépôt lié à une `commande_boutique` (la passe en « livrée »).
- Capture de signature (canvas tactile).
- Génération PDF (bon de dépôt + livraison).
- **À vérifier avant de coder** : validité juridique d'une signature simple vs qualifiée
  (eIDAS) pour un bon de dépôt B2B en Belgique.

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

## Connexion aux réseaux sociaux (Instagram / Facebook / TikTok)

Question ouverte : brancher directement le compte Instagram d'Alexandra sur l'app.

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

## Coûts récurrents

Prix indicatifs ~début 2026, à reconfirmer. Le développement est une dépense ponctuelle,
non incluse ici.

| Poste | Gratuit possible | Payant | Choix retenu |
|---|---|---|---|
| **Supabase** (DB, Auth, Storage, edge functions, cron) | Oui (0 €) | Pro **25 $/mois** | **Pro.** Le tier gratuit met le projet en pause après 7 j d'inactivité et n'a aucune sauvegarde — inacceptable pour un outil dont Alexandra dépend (rappels, crons). |
| **Hébergement front** (le PWA) | **Oui (0 €)** — Cloudflare Pages, usage commercial autorisé | Vercel Pro 20 $/mois | **Cloudflare Pages (0 €).** Vercel Hobby interdit l'usage commercial dans ses CGU ; soit payer Vercel Pro, soit migrer sur Cloudflare. |
| **API Claude** (assistant : chat + bilan hebdo) | Non (à l'usage) | ~**2 à 10 €/mois** | Modèle **Sonnet** partout (chat + hebdo). Cron hebdo ≈ 0,20 €/mois. Chat ≈ 2-8 €/mois selon l'usage. Web search : 10 $ / 1000 recherches. |
| **API Instagram / Meta** | **Oui (0 €)** | — | Graph API gratuite, pas d'abonnement. Coût = temps de dev uniquement. |
| **Push notifications** | **Oui (0 €)** | — | Web Push (VAPID), pas de frais APNs/FCM. |
| **Nom de domaine** | `*.pages.dev` / `*.vercel.app` (0 €) | ~**12 €/an** (~1 €/mois) | Optionnel. Un `.be` propre pour la comm. |
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
