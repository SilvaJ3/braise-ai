-- 0086 — Retire à `anon` le droit d'exécuter quatre fonctions qui ne servent qu'à un compte connecté
-- (audit du 05/10/2026, finding 9).
--
-- Supabase accorde EXECUTE à `anon` par défaut sur toute fonction créée dans `public` ; les migrations
-- d'origine n'avaient retiré que `public`. Ces quatre fonctions refusent déjà un appel anonyme (elles
-- lisent `auth.uid()` ou `est_admin()`) : ce n'était donc pas exploitable, mais une fonction qui ne
-- doit jamais être appelée par un anonyme ne doit pas lui être ouverte — une erreur dans une
-- version future ne laisserait alors rien passer.
--
-- Volontairement laissées à `anon` : les fonctions `boutique_*` à jeton (la boutique n'a pas de compte,
-- le jeton EST l'accès) et `emplacements_du_site` (lue par les sites des clients).

revoke execute on function public.comptes_admin(integer) from anon;
revoke execute on function public.corriger_declaration(uuid, text, text) from anon;
revoke execute on function public.couper_lien_boutique(uuid) from anon;
revoke execute on function public.marquer_contestation_vue(uuid) from anon;
