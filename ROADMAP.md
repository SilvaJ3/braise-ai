# Au Coin du Feu — Roadmap (ce qu'il reste à faire)

Référence produit : `specs/spec-app-au-coin-du-feu.md` et `specs/vision-assistant-virtuel.md`
(hors repo, dans `files.zip`). Test à appliquer à chaque feature avant de la coder :
*ça la décharge, ou ça lui ajoute une tâche ?*

## État

| Version | État |
|---|---|
| V1 — Planning réseaux sociaux + rappels au login | Fait, déployé (https://braise-ai.vercel.app) |
| V1.5 — Notifications push PWA | Fait (+ date/heure/rappel par entrée, auto-planification, fix mise à jour du service worker) |
| V7 — Couche IA assistant | Démarrée en avance : chat d'idées, bilan hebdo (cron lundi), voix de marque éditable, catalogue produits, retour « ça a marché ? », recherche web dans le chat. Reste à brancher sur V2/V3. |
| V2, V3, V4, V5, V6, V8 | Pas commencés |

## Écart assumé vs spec

La spec prévoit que V7 (IA) ne démarre qu'après V1–V4. L'assistant a été pris en avance
parce qu'il apporte de la valeur immédiate sur le planning seul. Conséquence : aujourd'hui
il raisonne uniquement sur le planning + le catalogue. Sa pleine valeur (relances boutiques,
alertes stock) attend V2 et V3.

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
