import { useState, useEffect } from 'react';
import { QrCode, Smartphone, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';

export default function WhatsAppSetup() {
  const [url, setUrl] = useState(localStorage.getItem('evolution_url') || 'https://evolution.pontozerosistem.com');
  const [apiKey, setApiKey] = useState(localStorage.getItem('evolution_api_key') || '');
  const [instanceName, setInstanceName] = useState('PontoZero');
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'qr' | 'connected' | 'error'>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Salvar no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem('evolution_url', url);
    localStorage.setItem('evolution_api_key', apiKey);
  }, [url, apiKey]);

  const SUPABASE_WEBHOOK_URL = 'https://zyuldjccrpmvzlgdxmtk.supabase.co/functions/v1/webhook-whatsapp';

  // Helper para chamadas na Evolution API
  const apiCall = async (endpoint: string, method: string = 'GET', body?: any) => {
    const cleanUrl = url.replace(/\/$/, '');
    const res = await fetch(`${cleanUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: body ? JSON.stringify(body) : undefined
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Erro na requisição');
    return data;
  };

  const checkStatus = async () => {
    try {
      const data = await apiCall(`/instance/connectionState/${instanceName}`);
      if (data?.instance?.state === 'open') {
        setStatus('connected');
        return true;
      }
      return false;
    } catch (e) {
      return false; // Instância não existe ou deu erro
    }
  };

  const handleConnect = async () => {
    if (!url || !apiKey || !instanceName) {
      setErrorMessage('Preencha a URL base e a Global API Key');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');
    
    let currentStep = 'Verificando status inicial';
    try {
      // 1. Verifica se já está conectado
      const isConnected = await checkStatus();
      if (isConnected) return;

      // 2. Tentar criar instância
      currentStep = 'Criar instância na Evolution';
      try {
        await apiCall('/instance/create', 'POST', {
          instanceName,
          qrcode: true,
          token: "", // Opcional, mas algumas versões pedem
        });
      } catch (e: any) {
        console.log("Instância pode já existir ou erro leve: ", e.message);
      }

      // 3. Configurar Webhook
      currentStep = 'Configurando Webhook';
      await apiCall(`/webhook/set/${instanceName}`, 'POST', {
        webhook: {
          url: SUPABASE_WEBHOOK_URL,
          webhookByEvents: false,
          webhookBase64: false,
          events: ["MESSAGES_UPSERT"]
        }
      });

      // 4. Configurar Settings
      currentStep = 'Configurando comportamentos (Settings)';
      await apiCall(`/settings/set/${instanceName}`, 'POST', {
        rejectCall: true,
        msgCall: "No momento não recebemos ligações por aqui. Por favor, envie uma mensagem de texto ou áudio.",
        groupsIgnore: true,
        alwaysOnline: true,
        readMessages: true,
      });

      // 5. Buscar QR Code
      currentStep = 'Buscando QR Code de Conexão';
      const qrData = await apiCall(`/instance/connect/${instanceName}`);
      
      if (qrData?.base64) {
        setQrCode(qrData.base64);
        setStatus('qr');
      } else {
        setErrorMessage('QR Code não retornou da Evolution. Clique em Conectar novamente.');
        setStatus('error');
      }

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage(`Erro em [${currentStep}]: ${err.message}`);
    }
  };

  const handleStartOver = async () => {
    if (!confirm('Tem certeza? Isso vai desconectar e deletar a instância do WhatsApp atual.')) return;
    
    setStatus('loading');
    try {
      await apiCall(`/instance/logout/${instanceName}`, 'DELETE');
      await apiCall(`/instance/delete/${instanceName}`, 'DELETE');
      setStatus('idle');
      setQrCode(null);
    } catch (e: any) {
      setErrorMessage(e.message || 'Erro ao deletar instância');
      setStatus('error');
    }
  };

  return (
    <div className="p-8 pb-32 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light text-white tracking-tight sm:text-4xl flex items-center gap-3">
            <Smartphone className="w-8 h-8 text-indigo-400" />
            Conexão WhatsApp
          </h1>
          <p className="mt-2 text-slate-400 font-light">
            Conecte o número da Ponto Zero usando a Evolution API diretamente por aqui.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Lado Esquerdo: Credenciais */}
        <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="mb-6">
            <h2 className="text-xl font-medium text-white mb-1">Credenciais da Evolution API</h2>
            <p className="text-sm text-slate-400">Insira os dados do seu provedor para gerar o QR Code.</p>
          </div>

          <div className="space-y-4 relative z-10">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">URL Base da Evolution</label>
              <input 
                type="text" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://sua-evolution.com"
                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Global API Key</label>
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Cole sua API Key Global"
                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Nome da Instância</label>
              <input 
                type="text" 
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={status === 'loading'}
              className="w-full mt-6 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {status === 'loading' ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <QrCode className="w-5 h-5" />
              )}
              {status === 'loading' ? 'Conectando...' : 'Gerar QR Code e Conectar'}
            </button>
          </div>
        </div>

        {/* Lado Direito: Status / QR Code */}
        <div className="bg-[#1e293b]/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center min-h-[400px] text-center">
          
          {status === 'idle' && (
            <div className="text-slate-400 flex flex-col items-center gap-4">
              <Smartphone className="w-16 h-16 opacity-20" />
              <p>Preencha os dados e clique em conectar para ver o QR Code.</p>
            </div>
          )}

          {status === 'loading' && (
            <div className="text-indigo-400 flex flex-col items-center gap-4">
              <RefreshCw className="w-12 h-12 animate-spin" />
              <p>Criando instância e configurando agentes...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-rose-400 flex flex-col items-center gap-4">
              <AlertCircle className="w-16 h-16" />
              <p>{errorMessage}</p>
              <button 
                onClick={() => setStatus('idle')}
                className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {status === 'qr' && qrCode && (
            <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-300">
              <div className="bg-white p-4 rounded-2xl">
                <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 border-none" />
              </div>
              <div>
                <h3 className="text-white font-medium text-lg">Escaneie o QR Code</h3>
                <p className="text-slate-400 text-sm mt-1">Abra o WhatsApp no celular, vá em Aparelhos Conectados e leia aponte a câmera.</p>
              </div>
              <button 
                onClick={checkStatus}
                className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Já escaneei, verificar conexão
              </button>
            </div>
          )}

          {status === 'connected' && (
            <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-emerald-400">WhatsApp Conectado!</h3>
                <p className="text-slate-400 mt-2">O Agente IA da Ponto Zero já está operando neste número.</p>
              </div>
              <button 
                onClick={handleStartOver}
                className="mt-6 text-sm text-rose-400 hover:text-rose-300 border border-rose-400/20 px-4 py-2 rounded-lg"
              >
                Desconectar (Apagar Instância)
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
