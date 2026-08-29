-- Crons push (fonction edge `push`). Secret partagé via Vault (voir 0003).

-- Rappels échus : toutes les 15 minutes
select cron.schedule(
  'push-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'assistant_cron_secret')
    ),
    body := jsonb_build_object('mode', 'reminders'),
    timeout_milliseconds := 60000
  );
  $$
);

-- Digest hebdo : lundi 07:05 UTC (juste après le run de l'assistant)
select cron.schedule(
  'push-weekly-digest',
  '5 7 * * 1',
  $$
  select net.http_post(
    url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'assistant_cron_secret')
    ),
    body := jsonb_build_object('mode', 'weekly-digest'),
    timeout_milliseconds := 60000
  );
  $$
);
