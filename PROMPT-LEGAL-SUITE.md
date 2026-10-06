Tu complètes les textes légaux de Braaise. La branche courante est `corrections-legales-2026-10`,
sur laquelle sept corrections ont déjà été appliquées (TVA alignée sur la BCE, renonciation à la
rétractation remplacée par la déclaration professionnelle, plafond de responsabilité à 500 € minimum
avec exception dol/faute lourde, juridiction, numéro de TVA retiré). Ne reviens pas dessus.

Le cahier des charges est le rapport `~/projets-clients/braaise-legal/CONTRE-CHECK-CLAUDE.md`
(364 lignes). Lis-le en entier d'abord : il liste précisément ce qui manque, avec l'article à chaque
fois. Tu traites les points ci-dessous, DANS CET ORDRE.

## 1. La page « Mentions légales »

Elle existe en brouillon dans `~/projets-clients/braaise-legal/02-MENTIONS.md` mais n'est PAS dans
l'application. Intègre-la dans `src/content/legal.ts` comme un troisième texte exporté, sur le même
modèle que CONDITIONS et CONFIDENTIALITE, et fais-la rendre par `src/routes/PageLegale.tsx` et
lier par `src/components/FooterLegal.tsx`. Elle doit porter : identité de l'éditeur, numéro
d'entreprise, adresse, contact, hébergeurs (nom ET adresse), et le statut TVA tel qu'il est
réellement aujourd'hui (identification en cours — le numéro n'est PAS publié).

## 2. Les six corrections RGPD

Dans le texte de confidentialité, dans l'ordre du rapport :
- **La base légale de chaque traitement** (art. 13.1.c) — le rapport propose le tableau au §7.3, reprends-le.
- **Le contrat de sous-traitance intégré**, pas « disponible sur demande » (art. 28.3) : il doit exister
  et lier les sous-traitants. Ajoute la liste des sous-traitants avec leur rôle et leur pays.
- **L'information du responsable en cas de violation** (art. 33.2) : en tant que sous-traitant, Braaise
  informe l'artisan « dans les meilleurs délais » — le texte ne parle aujourd'hui que de l'APD.
- **Les sous-traitants ultérieurs** (art. 28.2 et 28.4) : le mécanisme d'information et le droit
  d'opposition de l'artisan quand un sous-traitant change.
- **Le mécanisme de transfert par prestataire** (art. 44-46) : dire, pour chacun, si c'est le cadre
  de protection des données UE–États-Unis ou les clauses contractuelles types.
- **Le retrait du consentement** (art. 7.3) et **le droit d'opposition** (art. 21) formulés comme tels.
- **L'information des boutiques** (art. 13-14) : une boutique qui reçoit un bon ou signe est une
  personne concernée, elle doit être informée au moment où ses données sont collectées.

## 3. L'article « Qui peut s'abonner »

Une section dans CONDITIONS : Braaise est réservé aux professionnels ; le droit de rétractation des
consommateurs ne s'applique pas ; la déclaration professionnelle est recueillie à la souscription.

## Ce que tu ne traites PAS

- L'article « Comptes boutique » : JSB doit encore préciser son offre (prix, mois offerts, engagement).
  Laisse un crochet `[COMPTES BOUTIQUE — à compléter par JSB]` là où il devra aller.
- Tout ce qui touche au code de paiement (Stripe, webhook) : ne touche pas.
- Les migrations : ne touche pas.

## Contraintes

- Tu travailles sur la branche `corrections-legales-2026-10`. Tu ne fusionnes rien, tu ne pousses rien.
- **Les tests doivent passer** : `npx vitest run` (736 tests avant toi ; le nombre peut monter si tu
  ajoutes des tests, il ne doit pas baisser sans raison). Lance-les toi-même à la fin et **cite la
  sortie brute**.
- `npx tsc -b --noEmit` et `npm run lint` doivent passer aussi.
- **Si tu modifies un test pour qu'il passe, dis-le explicitement et explique pourquoi la règle
  testée a changé.** Ne modifie jamais un test pour cacher un défaut.
- Le format du fichier `legal.ts` est pauvre à dessein : `## ` ouvre une section, `- ` une puce,
  le reste est un paragraphe. Respecte-le.
- **Aucune affirmation juridique sans citer l'article**, et quand tu n'es pas sûr de la
  numérotation belge, écris « à confirmer » — c'est déjà la convention du rapport.
- Écris en français.

## À la fin

Montre : la sortie brute des tests relancés après ta dernière modification, ce que tu as corrigé
dans un test et pourquoi, et **la liste de ce qui n'est pas fini**. Marque « non testé » ce que tu
n'as pas exercé.
