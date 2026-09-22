-- Clé de déduplication pour l'import CSV Shopify et la future sync API.
alter table public.produits
  add column if not exists shopify_handle text;

create unique index if not exists produits_user_shopify_handle_idx
  on public.produits (user_id, shopify_handle)
  where shopify_handle is not null;
