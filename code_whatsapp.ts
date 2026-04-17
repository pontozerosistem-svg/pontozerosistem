import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CONFIGURAÇÃO DE SEGURANÇA ──────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_KEY   = Deno.env.get('OPENAI_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  
  try {
    const body = await req.json();
    if (body.event !== 'messages.upsert') return new Response('Ignorado', { status: 200 });

    const message = body.data.message;
    const remoteJid = body.data.key.remoteJid;
    const isFromMe = body.data.key.fromMe;
    const text = message.conversation || message.extendedTextMessage?.text;

    if (isFromMe || !text || !remoteJid) return new Response('Skip', { status: 200 });

    const { data: agentState } = await supabase.from('agent_state').select('*, leads!inner(*)').eq('leads.phone', remoteJid).single();
    if (!agentState || !agentState.is_active) return new Response('Desativado', { status: 200 });

    // OpenAI Request
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: 'Você é a Laura da Ponto Zero Consultoria. Seja breve e use emojis.' }, { role: 'user', content: text }],
        max_tokens: 300
      })
    });

    const aiData = await aiRes.json();
    const reply = aiData.choices[0].message.content;

    // Envio WhatsApp
    await fetch(`${Deno.env.get('EVOLUTION_API_URL')}/message/sendText/${Deno.env.get('EVOLUTION_INSTANCE')}`, {
      method: 'POST',
      headers: { 'apikey': Deno.env.get('EVOLUTION_API_KEY')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: remoteJid, textMessage: { text: reply } })
    });

    await supabase.from('agent_state').update({ last_message_at: new Date().toISOString() }).eq('id', agentState.id);
    return new Response('Sucesso', { status: 200 });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
