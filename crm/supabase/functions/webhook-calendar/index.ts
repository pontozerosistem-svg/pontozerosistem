import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase } from '../_shared/db.ts';
import { STAGES } from '../_shared/stages.ts';

// Configuração da Evolution API
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE');

async function sendWhatsApp(to: string, text: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    console.warn('[calendar] Evolution API não configurada corretamente');
    return;
  }
  const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: to,
      options: { delay: 1200, linkPreview: false },
      textMessage: { text },
    }),
  });
  if (!response.ok) {
    throw new Error(`[calendar] HTTP error: ${response.status} - ${await response.text()}`);
  }
}

async function saveMessage(leadId: string, role: string, content: string) {
  await supabase.from('conversations').insert({ lead_id: leadId, role, content });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const body = await req.json();
    console.log('[calendar] Recebido payload:', body);

    // Payload esperado do Zapier/Make.com: { "email": "o_email", "name": "O Nome", "datetime": "..." }
    const email = body.email;
    const name = body.name || 'Lead';
    const datetime = body.datetime; // opcional

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email não fornecido no payload' }), { status: 400 });
    }

    // Tenta encontrar o lead pelo email
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('id, phone, name')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);

    if (leadError || !leads || leads.length === 0) {
      console.warn('[calendar] Lead não encontrado para o email:', email);
      return new Response(JSON.stringify({ error: 'Lead não encontrado', email }), { status: 404 });
    }

    const lead = leads[0];

    // Atualiza o card para "Reunião agendada" (stage_id = 3)
    await supabase
      .from('leads')
      .update({ stage_id: STAGES.REUNIAO_AGENDADA })
      .eq('id', lead.id);

    // Atualiza o cérebro da inteligência para 'confirmado' para ela não dar mais follow-up
    await supabase
      .from('agent_state')
      .update({ phase: 'confirmado' })
      .eq('lead_id', lead.id);

    // Envia WhatsApp de confirmação
    if (lead.phone) {
      const formatedDate = datetime 
        ? `no dia ${datetime}`
        : 'conosco';

      const msg = `Perfeito, ${name.split(' ')[0]}! Acabei de ver aqui que você bloqueou um horário ${formatedDate} na agenda do Peu. Nos vemos na Reunião de Descoberta!`;
      
      try {
        await sendWhatsApp(lead.phone, msg);
        await saveMessage(lead.id, 'assistant', msg);
        console.log(`[calendar] Mensagem de confirmação enviada para ${lead.phone}`);
      } catch (err) {
        console.error(`[calendar] Falha ao enviar WhatsApp de confirmação:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, lead_id: lead.id, action: 'Reunião Agendada' }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[webhook-calendar] Erro fatal:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
