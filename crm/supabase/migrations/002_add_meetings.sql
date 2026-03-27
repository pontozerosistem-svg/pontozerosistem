-- ================================================================
-- MIGRAÇÃO: Adiciona stages de Reunião e tabela meetings
-- Execute este SQL no Supabase > SQL Editor
-- ================================================================

-- 1. Reorganiza os stages existentes para abrir espaço (5 e 6)
UPDATE pipeline_stages SET order_index = 7 WHERE name = 'Proposta Enviada';
UPDATE pipeline_stages SET order_index = 8 WHERE name = 'Negociação';
UPDATE pipeline_stages SET order_index = 9 WHERE name LIKE 'Ganho%';
UPDATE pipeline_stages SET order_index = 10 WHERE name LIKE 'Perdido%';

-- 2. Insere os novos stages de reunião
INSERT INTO pipeline_stages (name, order_index, color) VALUES
  ('Reunião Proposta',  4, '#06b6d4'),
  ('Reunião Agendada',  5, '#10b981')
ON CONFLICT DO NOTHING;

-- 3. Cria tabela de reuniões
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  google_event_id TEXT,
  meet_link TEXT,
  calendar_booking_url TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'proposed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS para meetings
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_meetings"
  ON meetings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Confirma
SELECT id, name, order_index FROM pipeline_stages ORDER BY order_index;
