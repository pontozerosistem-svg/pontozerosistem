// ============================================================
// Edge Function: webhook-lead
// Recebe lead da Landing Page
//
// Formato esperado:
// POST /functions/v1/webhook-lead
// {
//   "nome_completo": "João Silva",
//   "telefone_whatsapp": "5511999999999",
//   "canal_origem": "Lp seudinheironamesa"
// }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, saveMessage, logActivity } from '../_shared/db.ts';
import { sendWhatsApp }                       from '../_shared/evolution.ts';
import { STAGES }                             from '../_shared/stages.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Aceita apenas POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { 
      nome_completo, nome,
      telefone_whatsapp, telefone,
      email,
      canal_origem, origem 
    } = body;

    // Normalização dos campos
    const finalName   = nome_completo || nome || 'Lead';
    const finalPhone  = telefone_whatsapp || telefone;
    const finalSource = canal_origem || origem || 'landing_page';

    // Validação
    if (!finalPhone) {
      return Response.json({ error: 'Telefone obrigatório' }, { status: 400 });
    }

    // Limpa o telefone (só números)
    let phone = String(finalPhone).replace(/\D/g, '');
    
    // Se for um número brasileiro digitado sem o 55 (10 ou 11 dígitos), adiciona automaticamente
    if (phone.length === 10 || phone.length === 11) {
      phone = '55' + phone;
    }

    // ── Verifica se lead já existe ──────────────────────────
    // Busca apenas pelo número puro conforme definido no schema.sql
    const { data: existing } = await supabase
      .from('leads')
      .select('id, name')
      .eq('phone', phone)
      .maybeSingle();

    let leadId: string;

    if (existing) {
      // Lead já existe — atualiza nome e origem se necessário
      leadId = existing.id;
      await supabase.from('leads').update({
        name:   nome_completo || existing.name,
        email:  email || undefined,
        source: canal_origem || 'landing_page',
      }).eq('id', leadId);

      console.log(`[webhook-lead] Lead existente atualizado: ${leadId}`);
    } else {
      // ── Cria novo lead ──────────────────────────────────
      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          name:     finalName,
          phone,
          email,
          source:   finalSource,
          stage_id: STAGES.PRIMEIRO_CONTATO,
        })
        .select('id')
        .single();

      if (error) throw error;
      leadId = newLead.id;

      // Cria estado do agente para este lead
      await supabase.from('agent_state').insert({
        lead_id:    leadId,
        spin_phase: 'agendamento',
        spin_data:  {},
      });

      // Loga criação no histórico de atividades
      await logActivity(leadId, 'stage_change', `Lead criado via "${finalSource}"`, null, STAGES.PRIMEIRO_CONTATO);

      console.log(`[webhook-lead] Novo lead criado: ${leadId} | ${phone}`);

      // ── Dispara primeira mensagem no WhatsApp (em background) ───
      const backgroundWork = triggerFirstMessage(leadId, phone, finalName);
      
      // @ts-ignore: Supabase Edge Runtime support
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(backgroundWork);
      }
    }

    return Response.json({ success: true, lead_id: leadId }, { headers: corsHeaders });

  } catch (err) {
    console.error('[webhook-lead] Erro:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});

// ── Primeira mensagem do agente ──────────────────────────────
async function triggerFirstMessage(leadId: string, phone: string, name?: string) {
  const firstName = name?.split(' ')[0] || '';
  const saudacao  = firstName ? `Oi ${firstName},` : 'Oi,';

  const msg1 = `${saudacao} eu sou a Luiza aqui da Ponto Zero e vou dar sequência ao seu atendimento.`;
  const msg2 = `Aqui nós acreditamos muito que a forma que você se posiciona é crucial para o cliente te perceber como autoridade, mas também para você se sentir bem e saber que o que você mostra está coerente com sua essência, seus valores e suas capacidades.`;
  const msg3 = `Hoje você ja atua no mercado ou esta iniciando e quer comecar ja com um posicionamento alinhado?`;

  const fullText = `${msg1}\n\n${msg2}\n\n${msg3}`;
  await saveMessage(leadId, 'assistant', fullText);
  
  // Envia no Zap em um único bloco para economizar CPU (Plan NANO)
  let officialJid = null;
  const jid = await sendWhatsApp(phone, fullText);
  if (jid) officialJid = jid;

  // Atualiza estado do agente
  const updates: any = { 
    last_message_at: new Date().toISOString(),
    follow_up_count: 1,
    spin_data: { silence_followup_sent: false }
  };
  
  await supabase.from('agent_state')
    .update(updates)
    .eq('lead_id', leadId);

  if (officialJid && officialJid !== phone) {
    console.log(`[webhook-lead] Atualizando telefone para JID oficial: ${phone} -> ${officialJid}`);
    await supabase.from('leads')
      .update({ phone: officialJid })
      .eq('id', leadId);
  }
}
