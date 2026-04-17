import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import './index.css'
import { checkSupabaseConnection } from './lib/supabase'

console.log('[Main] App starting...');

// Diagnóstico silenciado para o AuthGuard gerenciar
checkSupabaseConnection().then(result => {
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
