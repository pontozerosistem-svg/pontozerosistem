-- Corrige campos em falta na tabela meetings devido ao não acionamento das migrations em sequência

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS feedback_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS proposal_reminder_sent BOOLEAN DEFAULT FALSE;
