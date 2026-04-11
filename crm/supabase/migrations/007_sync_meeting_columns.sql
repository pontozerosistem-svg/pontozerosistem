-- Migration 007: Sincroniza colunas de agendamento
-- Garante que 'scheduled_at' exista e seja o campo principal usado pela Luiza e pelo Frontend

DO $$ 
BEGIN
  -- Se scheduled_start existe mas scheduled_at não, renomeia por segurança
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meetings' AND column_name='scheduled_start') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meetings' AND column_name='scheduled_at') THEN
    ALTER TABLE meetings RENAME COLUMN scheduled_start TO scheduled_at;
  END IF;

  -- Se nenhum dos dois existe, cria scheduled_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meetings' AND column_name='scheduled_at') THEN
    ALTER TABLE meetings ADD COLUMN scheduled_at TIMESTAMPTZ;
  END IF;

  -- Garante que campos de lembrete existem (caso a migration 003 tenha falhado parcialmente)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='meetings' AND column_name='reminder_sent') THEN
    ALTER TABLE meetings ADD COLUMN reminder_sent BOOLEAN DEFAULT FALSE;
  END IF;
END $$;
