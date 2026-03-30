-- Migração 004:
-- 1. Permite ligar/desligar agente por lead
-- 2. Permite adicionar dias específicos de disponibilidade em vez de apenas dias da semana

-- Atualiza a tabela agent_state para conter o flag is_active
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_state' AND column_name='is_active') THEN
    ALTER TABLE agent_state ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- Atualiza a tabela professional_availability para permitir datas específicas
-- Para isso, precisamos remover a restrição NOT NULL de day_of_week
DO $$ 
BEGIN
  ALTER TABLE professional_availability ALTER COLUMN day_of_week DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ 
BEGIN
  -- Cria a coluna de data específica, se não existir
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='professional_availability' AND column_name='specific_date') THEN
    ALTER TABLE professional_availability ADD COLUMN specific_date DATE;
  END IF;
END $$;

-- Atualiza a view
DROP VIEW IF EXISTS crm_leads_view;
CREATE VIEW crm_leads_view AS
SELECT
  l.id,
  l.name,
  l.phone,
  l.email,
  l.source,
  l.score,
  l.notes,
  l.stage_id,
  l.created_at,
  l.updated_at,
  ps.name AS stage_name,
  ps.color AS stage_color,
  ps.order_index AS stage_order,
  ag.spin_phase,
  ag.last_message_at,
  ag.follow_up_count,
  COALESCE(ag.is_active, true) as is_active,
  (SELECT COUNT(*) FROM conversations c WHERE c.lead_id = l.id) AS message_count
FROM leads l
JOIN pipeline_stages ps ON ps.id = l.stage_id
LEFT JOIN agent_state ag ON ag.lead_id = l.id;