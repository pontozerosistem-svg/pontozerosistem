-- 1. Localiza a Maria Clara e vê o estado atual dela
SELECT l.id, l.name, l.phone, s.last_message_at, s.is_active, s.spin_data
FROM leads l
JOIN agent_state s ON s.lead_id = l.id
WHERE l.name ILIKE '%Maria Clara%';

-- 2. "Acordar" a Maria Clara (Reseta o nível de follow-up para 0 e volta o relógio em 1h)
-- Isso faz com que o Agendador entenda que ela precisa de um novo contato AGORA.
UPDATE agent_state
SET 
  last_message_at = NOW() - INTERVAL '65 minutes',
  spin_data = jsonb_set(
    jsonb_set(COALESCE(spin_data, '{}'::jsonb), '{follow_up_level}', '0'),
    '{silence_followup_sent}', 'false'
  )
WHERE lead_id IN (SELECT id FROM leads WHERE name ILIKE '%Maria Clara%');

-- 3. Verifica se o Cron está ativo no seu Supabase
SELECT * FROM cron.job;
