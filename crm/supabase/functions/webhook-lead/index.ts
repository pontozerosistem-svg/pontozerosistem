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
          stage_id: STAGES.NOVO_LEAD,
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
      await logActivity(leadId, 'stage_change', `Lead criado via "${finalSource}"`, null, STAGES.NOVO_LEAD);

      console.log(`[webhook-lead] Novo lead criado: ${leadId} | ${phone}`);

      // ── Dispara primeira mensagem no WhatsApp ───────────
      await triggerFirstMessage(leadId, phone, finalName);
    }

    return Response.json({ success: true, lead_id: leadId });

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
  const msg3 = `Como cada pessoa é um mundo inteiro, nosso processo é altamente particular e personalizado.\n\nPor isso, a melhor forma de prosseguirmos é com uma sessão de diagnóstico com nosso consultor responsável. Essa reunião não tem custo e o objetivo é entender sua demanda para fazer uma proposta totalmente coerente com seu momento e ambições.\n\nPodemos agendar a sua?`;

  const fullText = `${msg1}\n\n${msg2}\n\n${msg3}`;
  await saveMessage(leadId, 'assistant', fullText);
  
  // Envia no Zap separadamente com pequeno atraso para humanizar
  let officialJid = null;
  
  const jid1 = await sendWhatsApp(phone, msg1);
  if (jid1) officialJid = jid1;
  await new Promise(r => setTimeout(r, 1200));
  
  const jid2 = await sendWhatsApp(phone, msg2);
  if (jid2) officialJid = jid2;
  await new Promise(r => setTimeout(r, 1500));
  
  const jid3 = await sendWhatsApp(phone, msg3);
  if (jid3) officialJid = jid3;

  // Atualiza estado do agente
  const updates: any = { 
    last_message_at: new Date().toISOString(),
    follow_up_count: 1
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
