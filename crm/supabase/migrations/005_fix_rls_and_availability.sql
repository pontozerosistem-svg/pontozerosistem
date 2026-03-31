-- ================================================================
-- MIGRAÇÃO 005: Corrige RLS para usuários autenticados e disponibilidade
-- ================================================================

-- 1. Garante que day_of_week possa ser nulo (para suportar datas específicas)
ALTER TABLE professional_availability ALTER COLUMN day_of_week DROP NOT NULL;

-- 2. RLS para professional_availability (usuários logados no CRM)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'professional_availability' AND policyname = 'authenticated_all_availability'
  ) THEN
    CREATE POLICY "authenticated_all_availability" ON professional_availability FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. RLS para scheduling_settings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scheduling_settings' AND policyname = 'authenticated_all_settings'
  ) THEN
    CREATE POLICY "authenticated_all_settings" ON scheduling_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. RLS para meetings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'authenticated_all_meetings'
  ) THEN
    CREATE POLICY "authenticated_all_meetings" ON meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. RLS para agent_state
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_state' AND policyname = 'authenticated_all_agent_state'
  ) THEN
    CREATE POLICY "authenticated_all_agent_state" ON agent_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Garante que tabelas de suporte do pipeline também tenham RLS para authenticated (geralmente já tem, mas garantindo)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leads' AND policyname = 'authenticated_all_leads') THEN
    CREATE POLICY "authenticated_all_leads" ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
