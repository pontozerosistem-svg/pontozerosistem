import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CONFIGURAÇÃO ──────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 1. Suporte a CORS (Obrigatório para Landing Pages)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    
    // 2. Mapeamento de Campos da sua Landing Page
    const rawName = body.nome_completo || body.nome || 'Lead';
    const rawPhone = body.telefone_whatsapp || body.telefone;
    const source = body.canal_origem || 'landing_page';

    if (!rawPhone) return new Response(JSON.stringify({ error: 'Telefone é obrigatório' }), { status: 400, headers: corsHeaders });

    // 3. Limpeza de Telefone (Garante o 55 e remove lixo)
    let phone = String(rawPhone).replace(/\D/g, '');
    if (phone.length === 10 || phone.length === 11) phone = '55' + phone;

    console.log(`[Lead] Processando: ${phone} de ${source}`);

    // 4. Upsert do Lead (Cria ou Atualiza)
    const { data: lead, error: leadErr } = await supabase.from('leads').upsert({
      phone: phone,
      name: rawName,
      source: source,
      stage_id: 2, // Primeiro Contato
      is_active: true
    }).select().single();

    if (leadErr) throw leadErr;

    // 5. Estado do Agente e Primeira Mensagem (Laura)
    await supabase.from('agent_state').upsert({
      lead_id: lead.id,
      is_active: true,
      spin_phase: 'agendamento',
      last_message_at: new Date().toISOString()
    });

    // Chama a Laura internamente para dar as boas vindas
    const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-whatsapp`;
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({
        event: 'messages.upsert',
        data: { 
          message: { conversation: `Oi, eu sou a Luiza da Ponto Zero Consultoria. Vi que você se cadastrou via ${source}. Qual o seu maior desafio hoje?` },
          key: { remoteJid: phone, fromMe: false, id: `WELCOME_${Date.now()}` }
        }
      })
    });

    return new Response(JSON.stringify({ success: true, id: lead.id }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error('[Erro]', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
