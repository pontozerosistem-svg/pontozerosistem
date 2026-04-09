-- Agendamento da rotina de Follow-up (SILÊNCIO DO LEAD)
-- Verifica leads travados na Fase 1 a cada 30 minutos

SELECT cron.schedule(
    'process-followups-every-30-minutes',
    '*/30 * * * *', -- a cada 30 minutos
    $$
    select net.http_post(
        url:='https://zyuldjccrpmvzlgdxmtk.supabase.co/functions/v1/process-followups',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.claim.role', true) || '"}'::jsonb
    )
    $$
);
