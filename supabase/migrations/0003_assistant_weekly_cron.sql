-- Cron hebdo de l'assistant (lundi 07:00 UTC).
-- Prérequis manuel (une fois, hors migration, pour ne pas versionner le secret) :
--   select vault.create_secret('<valeur-aléatoire>', 'assistant_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'assistant-weekly',
  '0 7 * * 1',
  $$
  select net.http_post(
    url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/assistant',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'assistant_cron_secret')
    ),
    body := jsonb_build_object('mode', 'weekly'),
    timeout_milliseconds := 120000
  );
  $$
);
