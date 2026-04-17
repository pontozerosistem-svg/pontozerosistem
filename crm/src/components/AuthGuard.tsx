import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        setError('connection_timeout');
        setLoading(false);
      }
    }, 10000);

    supabase.auth.getSession().then(({ data: { session }, error: authError }) => {
      if (!mounted) return;
      clearTimeout(timeout);
      
      if (authError) {
        console.error('[AuthGuard] Session error:', authError);
        setError(authError.message);
      } else {
        setSession(session);
      }
      setLoading(false);
    }).catch(err => {
      if (!mounted) return;
      clearTimeout(timeout);
      console.error('[AuthGuard] Fetch error:', err);
      setError('network_error');
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-slate-400 animate-pulse">Verificando conexão com o servidor...</p>
      </div>
    );
  }

  if (error || (!session && error === 'connection_timeout')) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#1e293b] rounded-2xl p-8 border border-slate-800 shadow-2xl text-center">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h2 className="text-xl font-bold text-white mb-2">Falha na Conexão</h2>
          <p className="text-slate-400 mb-6 text-sm">
            Não foi possível estabelecer contato com o servidor do Supabase. Isso geralmente ocorre por instabilidade no DNS ou bloqueio de rede.
          </p>

          <div className="bg-[#0f172a] rounded-lg p-4 mb-6 text-left">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Sugestões de solução:</h3>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex gap-2">
                <span className="text-indigo-500">•</span>
                Verifique se sua internet está ativa.
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-500">•</span>
                Tente trocar o seu DNS para 8.8.8.8 (Google) ou 1.1.1.1.
              </li>
              <li className="flex gap-2">
                <span className="text-indigo-500">•</span>
                Verifique se o projeto está Ativo no painel do Supabase.
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Tentar Novamente
            </button>
            <a 
              href="/login"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center"
            >
              Ir para Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
