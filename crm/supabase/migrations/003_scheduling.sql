-- 1. Cria tabela de reuniões (se não existir por causa do 002)
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  google_event_id TEXT,
  meet_link TEXT,
  calendar_booking_url TEXT,
  scheduled_start TIMESTAMPTZ, -- Novo campo para agendamento exato
  status TEXT DEFAULT 'proposed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reminder_sent BOOLEAN DEFAULT FALSE,
  feedback_sent BOOLEAN DEFAULT FALSE,
  proposal_reminder_sent BOOLEAN DEFAULT FALSE
);

-- RLS para meetings
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_meetings"
    ON meetings FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Tabela de configurações globais de agendamento
CREATE TABLE IF NOT EXISTS scheduling_settings (
  id SERIAL PRIMARY KEY,
  agent_enabled BOOLEAN DEFAULT TRUE,
  consultant_phone TEXT, -- número para receber lembretes
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insere default se não existir
INSERT INTO scheduling_settings (id, agent_enabled) 
VALUES (1, TRUE) 
ON CONFLICT (id) DO NOTHING;

-- 3. Tabela de disponibilidade do profissional
CREATE TABLE IF NOT EXISTS professional_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Domingo, 1 = Segunda...
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insere horários padrão de segunda a sexta (1 a 5) das 09:00 às 18:00
INSERT INTO professional_availability (day_of_week, start_time, end_time) VALUES
(1, '09:00', '18:00'),
(2, '09:00', '18:00'),
(3, '09:00', '18:00'),
(4, '09:00', '18:00'),
(5, '09:00', '18:00');

-- 4. RLS para novas tabelas
ALTER TABLE scheduling_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_availability ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_scheduling_settings" ON scheduling_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_professional_availability" ON professional_availability FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon_read_scheduling_settings" ON scheduling_settings FOR SELECT TO anon USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon_read_availability" ON professional_availability FOR SELECT TO anon USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
