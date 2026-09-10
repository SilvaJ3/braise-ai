-- Cron publication planifiée (fonction edge `instagram-publish`, mode "due").
-- Toutes les 10 min : publie les entrées planifiées dont l'heure est passée.

select cron.schedule(
  'instagram-publish-due',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://nnssqleqvfafbkkxyqne.supabase.co/functions/v1/instagram-publish',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'assistant_cron_secret')
    ),
    body := jsonb_build_object('mode', 'due'),
    timeout_milliseconds := 60000
  );
  $$
);
