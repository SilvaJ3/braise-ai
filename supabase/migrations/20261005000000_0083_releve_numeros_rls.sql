-- 0083 — Fermer `releve_numeros` : alerte Supabase « rls_disabled_in_public » du 27/09/2026.
--
-- Constat (04/10/2026) : la 0063 a créé `public.releve_numeros` (compteur des numéros de relevé, REL-<année>-NNN) sans RLS et
-- sans retirer les droits par défaut : `anon` et `authenticated` avaient TOUS les droits (SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE). Via l'URL du projet et la clé publique, n'importe qui pouvait lire, fausser ou vider le compteur — et un numéro de
-- relevé doit rester continu et sans doublon. La table était VIDE (aucun relevé émis) : rien n'a été altéré à notre connaissance.
--
-- Le compteur n'est écrit que par `releve_numero_suivant` (security definer, déjà fermée aux clients) : aucun client n'a besoin
-- de cette table. RLS activée sans politique + droits retirés : seule la fonction (propriétaire de la table) et le service y accèdent.
alter table public.releve_numeros enable row level security;
revoke all on public.releve_numeros from public, anon, authenticated;
