import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import './index.css'
import { checkSupabaseConnection } from './lib/supabase'

console.log('[Main] App starting...');

// Diagnóstico com Timeout
const connectionTimeout = setTimeout(() => {
  console.error('[Main] Supabase connection timed out after 5s');
  const rootElement = document.getElementById('root');
  if (rootElement && rootElement.innerHTML === '') {
    rootElement.innerHTML = `
      <div style="background: #1e293b; color: white; padding: 40px; font-family: sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center;">
        <div style="max-width: 500px;">
          <h1 style="color: #fbbf24; margin-bottom: 20px;">⚠️ Conexão Lenta ou Falha</h1>
          <p style="font-size: 16px; margin-bottom: 20px;">O navegador não conseguiu conectar ao Supabase após 5 segundos.</p>
          <div style="background: #0f172a; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 14px; margin-bottom: 20px;">
            URL: https://zyuldjccrpmvzlgdxmtk.supabase.co
          </div>
          <p style="color: #94a3b8; font-size: 14px;">Verifique se o ID do projeto no Supabase mudou ou se o banco de dados ainda está "Iniciando".</p>
          <button onclick="window.location.reload()" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-top: 20px; font-weight: 600;">
            Verificar Novamente
          </button>
        </div>
      </div>
    `;
  }
}, 5000);

checkSupabaseConnection().then(result => {
  clearTimeout(connectionTimeout);
  if (!result.success) {
    console.warn('[Main] Supabase connection is NOT ready:', result.message);
  } else {
    console.log('[Main] Supabase connection is healthy.');
  }
});

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Elemento "root" não encontrado no index.html');

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>,
  )
} catch (error) {
  console.error('[Main] Erro fatal durante a montagem do React:', error);
  document.body.innerHTML = `
    <div style="background: #1e293b; color: white; padding: 20px; font-family: sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center;">
      <div>
        <h1 style="color: #ef4444;">Erro Crítico no Ponto Zero CRM</h1>
        <p>A aplicação não conseguiu iniciar. Veja o console (F12) para detalhes.</p>
        <pre style="background: #0f172a; padding: 10px; border-radius: 8px; margin-top: 20px; font-size: 12px; text-align: left;">
${error}
        </pre>
        <button onclick="window.location.reload()" style="background: #4f46e5; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-top: 20px;">
          Tentar Novamente
        </button>
      </div>
    </div>
  `;
}
