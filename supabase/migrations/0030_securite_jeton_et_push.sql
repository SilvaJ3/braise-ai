-- 0030 — Le jeton OAuth Instagram ne doit jamais atteindre le navigateur, et l'unicité d'un
-- abonnement push doit être par compte, pas globale.
--
-- 1) instagram_accounts.access_token
--
-- La table est née hors migration (les fonctions instagram-oauth / instagram-publish ne sont pas
-- versionnées non plus) et sa policy RLS est un simple SELECT pour `authenticated`. Vérification
-- faite : les grants sont posés AU NIVEAU TABLE (`has_table_privilege(...)` → true), donc un
-- `revoke select (access_token)` seul n'aurait strictement rien changé — PostgreSQL continue de
-- servir la colonne tant que le privilège table existe. Il faut révoquer puis ré-accorder
-- colonne par colonne.
--
-- Le front ne lit jamais cette table (seules les deux edge functions en service_role l'utilisent,
-- et service_role n'est pas touché ici), donc rien ne casse côté client.

revoke all on public.instagram_accounts from anon, authenticated;

grant select (user_id, ig_user_id, ig_username, token_expires_at, connected_at, updated_at)
  on public.instagram_accounts to authenticated;

-- `anon` ne garde rien : cette table n'a aucun usage pour un visiteur non connecté.

-- 2) push_subscriptions : un endpoint appartient au navigateur, pas au compte
--
-- La contrainte était `UNIQUE (endpoint)` — globale à tous les utilisateurs. Au second compte
-- sur le même appareil, l'insert violait la contrainte que RLS masquait : erreur 23505
-- incompréhensible, et le second utilisateur ne recevait jamais ses notifications tandis que le
-- premier continuait de recevoir les siennes sur l'appareil partagé.

alter table public.push_subscriptions drop constraint push_subscriptions_endpoint_key;

alter table public.push_subscriptions
  add constraint push_subscriptions_user_endpoint_key unique (user_id, endpoint);

-- Le client doit désormais désabonner par endpoint (il ne voit que ses propres lignes sous RLS,
-- donc le delete de l'un n'affecte plus l'abonnement de l'autre).
