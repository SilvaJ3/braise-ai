Tu as le plugin **legal** (Anthropic, v1.3.0) installé. Utilise-le **pour de vrai** :
invoque ses skills (`review-contract`, `compliance-check`, `legal-risk-assessment`,
`triage-nda`, `legal-response`) au lieu de raisonner en généraliste. Dis lesquelles tu
as réellement chargées et ce que chacune t'a apporté.

## La mission : contre-checker les textes qui engagent Braaise

Les textes vivent dans `src/content/legal.ts` de ce dépôt (branche courante). Ils couvrent
les conditions générales, la page légale, les mentions et le traitement des données.
Le rendu : `src/routes/PageLegale.tsx`, le lecteur : `src/lib/texte-legal.ts`.
Les points à trancher sont documentés dans `~/projets-clients/braaise-legal/`.
Les migrations liées : `supabase/migrations/` (cherche `conditions_acceptees`).

## Contexte : Braaise en deux lignes

- **braaise.io** : app pour artisans (dépôt-vente en boutique). Éditeur : JSB, indépendant
  en Belgique, BCE/TVA **BE 1043.060.596**. Prix HTVA, TVA belge 21 % via Stripe Tax.
- **Deux publics**, et ils n'ont pas les mêmes droits : **les artisans (B2B, assujettis)**
  et **les boutiques**. Vérifie justement si tes textes traitent les deux ou en oublient un.
- **Paiement Stripe**, essai 7 jours avec carte, abonnement mensuel 39 € HTVA ou annuel 390 € HTVA.

## CE QUE JE VEUX QUE TU VÉRIFIES EN PRIORITÉ — trois points précis

1. **La renonciation au droit de rétractation (art. VI.47 et VI.53, 13° CDE).**
   Le texte actuel dit : « En validant l'abonnement, tu demandes que l'accès commence
   immédiatement et tu renonces au droit de rétractation de quatorze jours. »
   **La loi exige trois choses cumulatives** : une demande expresse d'exécution immédiate
   (case distincte, non pré-cochée), la reconnaissance par le client qu'il perd son droit
   **une fois le service pleinement exécuté**, et une **confirmation sur support durable**.
   Dis si le texte est valable, ce qui manque, et **écris la formulation correcte**.

2. **Le bouton de rétractation en ligne.** La directive UE 2023/2673 devait être transposée
   **au plus tard le 19 juin 2026** : bouton actif pendant toute la période de rétractation,
   accusé de réception immédiat sur support durable. **Est-ce que Braaise l'a ?** Cherche
   dans le code. Si non, dis ce qu'il faut ajouter, techniquement et juridiquement.

3. **L'état de la TVA.** Un contrôle VIES du 05/10/2026 dit que le numéro **BE 1043.060.596
   n'est PAS reconnu**. Or `legal.ts` affirme la TVA active, l'autoliquidation et 21 %.
   **Y a-t-il contradiction ?** Si oui, dis exactement quelles phrases sont fausses tant que
   VIES ne valide pas, et quelle formulation tenir en attendant.

## Puis le reste, dans l'ordre de gravité

- **Les deux publics** : les conditions couvrent-elles l'artisan (B2B) et la boutique ?
  Lequel est oublié ? Un professionnel n'a pas de droit de rétractation — est-ce dit ?
- **Les mentions obligatoires belges** : identité de l'éditeur, numéro d'entreprise, TVA,
  adresse, contact, hébergeur, médiateur de la consommation, garanties légales.
  **Liste ce qui manque**, un par un.
- **RGPD** : base légale de chaque traitement, durées de conservation, sous-traitants
  (Supabase, Vercel, Stripe, Resend), transferts hors UE, droits des personnes.
- **Contradictions internes** : un même point affirmé de deux façons dans le fichier.
  Il y en a au moins une (l'état de la TVA selon les branches) — trouve-les toutes.
- **Clauses à risque** : celles qui limitent les droits du client, ou qu'un juge belge
  écarterait. Signale-les même si elles te semblent défendables.

## Contraintes

- **N'applique PAS de correction** : aucun fichier de code modifié, rien fusionné, rien en
  production. Tu produis un rapport.
- **Cite l'article** chaque fois que tu affirmes une obligation. Sans article, tu dis
  « à confirmer par un juriste ».
- **Distingue trois niveaux** : *obligation légale* (tu cites l'article) / *recommandation*
  (usage, risque de contentieux) / *opinion* (ton jugement).
- **Le droit belge et européen** est ton cadre, pas le droit français ni américain.
- Écris en **français**, dans `~/projets-clients/braaise-legal/CONTRE-CHECK-CLAUDE.md`.

## À la fin

Une page de synthèse : **ce qui est faux et doit être changé avant publication**,
**ce qui manque**, **ce qui est défendable en l'état**. Et ce que tu n'as **pas** pu vérifier.

**Ne présente jamais une vérification que tu n'as pas faite comme faite.** Si tu n'as pas
lu le code, dis-le.
