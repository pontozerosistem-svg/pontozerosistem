-- 1. Atualizar as etapas principais
UPDATE pipeline_stages SET name = 'Primeiro contato', color = '#94a3b8', order_index = 1 WHERE id = 1;
UPDATE pipeline_stages SET name = 'Agendamento de reunião', color = '#3b82f6', order_index = 2 WHERE id = 2;
UPDATE pipeline_stages SET name = 'Reunião agendada', color = '#f59e0b', order_index = 3 WHERE id = 3;
UPDATE pipeline_stages SET name = 'Envio de proposta', color = '#8b5cf6', order_index = 4 WHERE id = 4;
UPDATE pipeline_stages SET name = 'Ganho', color = '#22c55e', order_index = 5 WHERE id = 5;
UPDATE pipeline_stages SET name = 'Perdido', color = '#ef4444', order_index = 6 WHERE id = 6;

-- 2. Migrar os leads que estavam na antiga etapa 7 (Ganho 🏆) para o novo ID 5
UPDATE leads SET stage_id = 5 WHERE stage_id = 7;

-- 3. Migrar os leads que estavam na antiga etapa 8 (Perdido ❌) para o novo ID 6
UPDATE leads SET stage_id = 6 WHERE stage_id = 8;

-- 4. Excluir as etapas 7 e 8 que não serão mais usadas
DELETE FROM pipeline_stages WHERE id IN (7, 8);
