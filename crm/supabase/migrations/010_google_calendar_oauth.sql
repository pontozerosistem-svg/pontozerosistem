-- Adiciona campos para integração com Google Calendar via OAuth2
ALTER TABLE scheduling_settings 
ADD COLUMN IF NOT EXISTS google_client_id TEXT,
ADD COLUMN IF NOT EXISTS google_client_secret TEXT,
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

-- Comentário para controle
COMMENT ON COLUMN scheduling_settings.google_client_id IS 'ID do cliente OAuth2 do Google';
COMMENT ON COLUMN scheduling_settings.google_client_secret IS 'Chave secreta do cliente OAuth2 do Google';
COMMENT ON COLUMN scheduling_settings.google_refresh_token IS 'Refresh Token para geração de novos Access Tokens';

-- NOTA: Não inclua credenciais reais aqui para evitar bloqueio do GitHub.
-- Use o painel de configurações do CRM para salvar seus dados com segurança.
