-- 0080 — Hygiène des droits sur la partie « lien boutique ».
--
-- Constat (lecture seule de la base, 03/10) : `boutique_liens`, `boutique_lien_partenaires` et
-- `declarations_ventes` portent TOUS les droits de table (arwdDxtm) pour `anon` ET `authenticated`
-- — tables créées sans `revoke`, droits par défaut hérités de Supabase. La RLS fait le tri, mais
-- « un droit de TABLE écrase tout » : c'est le défaut déjà corrigé pour `assistant_profil` (0075).
--
-- Recensement AVANT de retirer (rien n'est supposé) :
--   · le front n'accède directement à AUCUNE de ces trois tables (grep `from('…')` dans src/) ;
--   · seule la fonction `depot` les lit, avec la CLÉ DE SERVICE (`admin`, depot/index.ts:43) ;
--   · toute fonction SQL qui les touche est `security definer` (exécutée par le propriétaire) :
--     elle ne dépend pas des droits de `anon` / `authenticated`.
-- `service_role` et `postgres` gardent leurs droits : rien ne change pour les fonctions et le cron.
--
-- Deuxième point : `mon_compte()` est exécutable par `anon` et PUBLIC. Sans connexion elle rend une
-- ligne « essai » à zéro (pas de fuite), mais l'accès n'a aucune raison d'exister : réservé aux
-- comptes connectés. Le `grant` suit dans la MÊME migration (un `revoke` mal posé fermerait l'écran
-- « Mon compte » à tout le monde).

revoke all on public.boutique_liens from anon, authenticated;
revoke all on public.boutique_lien_partenaires from anon, authenticated;
revoke all on public.declarations_ventes from anon, authenticated;

revoke execute on function public.mon_compte() from public, anon;
grant execute on function public.mon_compte() to authenticated, service_role;
