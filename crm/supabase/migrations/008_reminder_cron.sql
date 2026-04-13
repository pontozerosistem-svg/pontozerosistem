-- Migration 008: Cron job para disparar lembretes de reunião
-- Executa a cada 5 minutos para não perder a janela de 30 min antes

-- Remove job antigo se existir (idempotente)
SELECT cron.unschedule('process-reminders-every-5-minutes') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-reminders-every-5-minutes'
);

SELECT cron.schedule(
    'process-reminders-every-5-minutes',
    '*/5 * * * *',
    $$
    select net.http_post(
        url:='https://zyuldjccrpmvzlgdxmtk.supabase.co/functions/v1/process-reminders',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{}'::jsonb
    )
    $$
);
