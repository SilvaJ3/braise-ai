-- Marqueur d'envoi du rappel push (idempotence du cron)
alter table public.content_entries add column reminder_sent_at timestamptz;

create index content_entries_reminder_due_idx
  on public.content_entries (reminder_at)
  where reminder_at is not null and reminder_sent_at is null;
