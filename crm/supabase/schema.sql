-- ============================================================
-- CRM: Seu Dinheiro na Mesa
-- Schema Supabase
-- ============================================================

-- Fases do pipeline
CREATE TABLE pipeline_stages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  order_index INT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO pipeline_stages (name, order_index, color) VALUES
  ('Novo Lead',        1, '#94a3b8'),
  ('Primeiro Contato', 2, '#3b82f6'),
  ('Qualificação',     3, '#f59e0b'),
  ('Apresentação',     4, '#8b5cf6'),
  ('Proposta Enviada', 5, '#ec4899'),
  ('Negociação',       6, '#f97316'),
  ('Ganho 🏆',         7, '#22c55e'),
  ('Perdido ❌',       8, '#ef4444');

-- Leads
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  phone TEXT UNIQUE NOT NULL,        -- número no formato Evolution: 5511999999999
  email TEXT,
  source TEXT DEFAULT 'landing_page',
  stage_id INT REFERENCES pipeline_stages(id) DEFAULT 1,
  score INT DEFAULT 0,               -- score SPIN (0-100)
  notes TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico de conversas
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  channel TEXT DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Atividades / log do pipeline
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- 'stage_change', 'note', 'message', 'call'
  description TEXT,
  from_stage_id INT,
  to_stage_id INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Estado atual do agente por lead
CREATE TABLE agent_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE UNIQUE,
  spin_phase TEXT DEFAULT 'situacao',  -- situacao | problema | implicacao | necessidade | fechamento
  spin_data JSONB DEFAULT '{}',        -- coleta das respostas SPIN
  last_message_at TIMESTAMPTZ,
  follow_up_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_conversations_lead ON conversations(lead_id);
CREATE INDEX idx_activities_lead ON activities(lead_id);

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_agent_state_updated BEFORE UPDATE ON agent_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- View útil para o CRM
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
  (SELECT COUNT(*) FROM conversations c WHERE c.lead_id = l.id) AS message_count
FROM leads l
JOIN pipeline_stages ps ON ps.id = l.stage_id
LEFT JOIN agent_state ag ON ag.lead_id = l.id;
