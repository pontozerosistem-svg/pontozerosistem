// ============================================================
// Edge Function: webhook-whatsapp
// Recebe mensagens da Evolution API (WhatsApp)
//
// URL configurada na Evolution:
// POST /functions/v1/webhook-whatsapp
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, saveMessage, logActivity } from '../_shared/db.ts';
import { sendWhatsApp } from '../_shared/evolution.ts';
import { generateAgentReply } from '../_shared/agent.ts';
import { STAGES, STAGE_NAMES } from '../_shared/stages.ts';
import { getAudioBase64, transcribeAudio } from '../_shared/audio.ts';
import { getAccessToken, createCalendarEvent } from '../_shared/google.ts';



serve(async (req) => {
  const method = req.method;
  const url = req.url;
  console.log(`[webhook-whatsapp] Request: ${method} ${url}`);

  if (method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  if (method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const hasUrl = !!Deno.env.get('SUPABASE_URL');
    const hasKey = !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    console.log(`[whatsapp-diag] Iniciando processamento. URL: ${hasUrl}, Key: ${hasKey}`);

    const rawBody = await req.text();
    if (!rawBody) {
      console.warn('[webhook-whatsapp] Body vazio recebido.');
      return new Response('ok', { status: 200 });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
      console.log(`[DEBUG-RAW] Evento: ${event.event || event.type} | Instance: ${event.instance}`);
    } catch (e: any) {
      console.error('[webhook-whatsapp] Falha ao parsear JSON:', e.message);
      return new Response('ok', { status: 200 });
    }

    // Suporta múltiplos formatos de evento da Evolution API
    const eventName = event.event || event.type || '';
    const msg = event.data?.message || event.message;
    const isFromMe = event.data?.key?.fromMe || event.fromMe === true;

    console.log(`[webhook-whatsapp] Evento: ${eventName} | FromMe: ${isFromMe}`);

    // Só processamos se houver conteúdo de mensagem e NÃO for enviado pelo próprio robô
    const hasContent = !!(msg?.conversation || msg?.extendedTextMessage?.text || msg?.audioMessage || msg?.imageMessage?.caption);

    if (isFromMe) {
      console.log('[webhook-whatsapp] Ignorando: mensagem enviada pelo próprio agente.');
      return new Response('ok', { status: 200 });
    }

    if (!hasContent && !eventName.toLowerCase().includes('upsert')) {
      console.log(`[webhook-whatsapp] Ignorando evento de sistema sem conteúdo: ${eventName}`);
      return new Response('ok', { status: 200 });
    }

    const dataObj = event.data || event; // Tenta pegar do data ou do root
    const rawJid = dataObj.key?.remoteJid || dataObj.remoteJid || event.sender;
    const messageId = dataObj.key?.id || dataObj.id;

    if (!rawJid) {
      console.warn('[webhook-whatsapp] remoteJid não encontrado no payload.');
      return new Response('ok', { status: 200 });
    }

    const jid = normalizeJid(rawJid, event, dataObj);
    const instanceName = event.instance || event.data?.instance || Deno.env.get('EVOLUTION_INSTANCE');

    // Filtra Grupos, Comunidades e o próprio Agente
    if (
      jid.includes('@g.us') ||
      jid.includes('@broadcast') ||
      jid.includes('newsletter') ||
      jid.includes('553186460883') ||
      jid.includes('553891391840') || // Ignora o próprio número do agente Ponto Zero (zeroponto)
      jid === '553891391840@s.whatsapp.net'
    ) {
      console.log(`[whatsapp] Mensagem ignorada (sistema/próprio agente): ${jid}`);
      return new Response('ok', { status: 200 });
    }

    const text =
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption || 
      (msg?.audioMessage ? '[Processando Áudio...]' : '');

    if (jid && text) {
      console.log(`[webhook-whatsapp] Iniciando processamento para ${jid}`);
      await processMessage(jid, text, instanceName);
    }

    return new Response('ok', { status: 200 });

  } catch (err: any) {
    console.error('[webhook-whatsapp] Erro crítico:', err.message);
    return new Response('ok', { status: 200 });
  }
});


// ============================================================
// NORMALIZA JID — converte @lid e remove sufixos de dispositivo (:30, etc)
// ============================================================
function normalizeJid(rawJid: string, event: any, dataObj: any): string {
  if (!rawJid) return rawJid;
  
  if (rawJid.includes('@s.whatsapp.net')) return rawJid;

  const candidates: any[] = [
    dataObj?.key?.remoteJidAlt,             
    event?.remoteJidAlt,                    
    dataObj?.remoteJidAlt,                  
    event?.senderPn,                        
    dataObj?.senderPn,                      
    event?.sender,                          
    dataObj?.sender,                        
    dataObj?.phoneNumber,                   
    dataObj?.contact?.id,                   
    dataObj?.key?.participant,              
    dataObj?.participant,                   
  ];

  for (let candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;

    if (candidate.includes('@s.whatsapp.net')) {
      if (!candidate.includes('553891391840')) { 
        return candidate;
      }
    }

    const numeric = candidate.replace(/\D/g, '');
    if (numeric.length >= 10 && numeric.length <= 15) {
      if (numeric !== '553891391840') {
        const formatted = `${numeric}@s.whatsapp.net`;
        console.log(`[whatsapp] Número real extraído de "${candidate}": ${formatted}`);
        return formatted;
      }
    }
  }

  if (rawJid.includes('@lid')) {
    console.log(`[whatsapp] Não foi possível extrair número real para o LID: ${rawJid}`);
  }
  
  return rawJid;
}

// ============================================================
// CORE — Processa mensagem recebida
// ============================================================
async function processMessage(jid: string, userText: string, instanceName?: string) {
  const isLid = jid.includes('@lid');
  const numeric = jid.replace(/\D/g, '');

  console.log(`[whatsapp] Nova mensagem | JID: ${jid} | Instância: ${instanceName} | Texto: ${userText.substring(0, 30)}`);

  // --- BUSCA UNIFICADA DE LEAD (Otimização Drástica de Performance) ---
  const { data: lead, error: findError } = await supabase
    .from('leads')
    .select('*, agent_state(*)')
    .or(`phone.eq.${jid},phone.eq.${numeric},metadata->known_lids.cs.["${jid}"],metadata->known_numbers.cs.["${numeric}"]`)
    .maybeSingle();

  if (findError) {
    console.error('[whatsapp] Erro na busca unificada:', findError.message);
  }

  if (!lead) {
    console.warn(`[whatsapp] Lead NÃO IDENTIFICADO para: ${jid}. Ignorando.`);
    return;
  }

  const leadId     = lead.id;
  console.log(`[whatsapp] Lead ID: ${leadId} pronto para processamento.`);
  const oldStage   = lead.stage_id ?? STAGES.PRIMEIRO_CONTATO;
  const agentState = (lead.agent_state?.[0] || lead.agent_state) ?? {
    spin_phase: 'agendamento',
    spin_data: {},
    follow_up_count: 0,
    is_active: true,
  };

  console.log(`[agent-context] Lead: ${leadId} | JID: ${jid} | Phase: ${agentState.spin_phase} | Msgs: ${agentState.follow_up_count}`);
  
  if (!lead.agent_state || (Array.isArray(lead.agent_state) && lead.agent_state.length === 0)) {
    console.warn(`[whatsapp] Agent state NÃO encontrado para lead ${leadId} via join - usando default 'agendamento'.`);
  }

  // ── Se identificador é @lid, salva nos metadados para futuros matches ──
  if (jid.includes('@lid')) {
    const currentMeta  = lead.metadata || {};
    const knownLids    = currentMeta.known_lids || [];
    if (!knownLids.includes(jid)) {
      await supabase.from('leads')
        .update({ metadata: { ...currentMeta, known_lids: [...knownLids, jid] } })
        .eq('id', leadId);
      console.log(`[whatsapp] LID ${jid} registrado nos metadados do lead ${leadId}`);
    }
  }

  // ── Salva mensagem do usuário ───────────────────────────
  try {
    await saveMessage(leadId, 'user', userText);
  } catch (e: any) {
    console.warn(`[whatsapp] Falha ao salvar mensagem do usuário no histórico: ${e.message}`);
    // Não interrompe o fluxo se falhar apenas o histórico (melhor responder sem histórico do que não responder)
  }

  // ── Verifica configurações do agente (Global e por Lead) ────────
  const { data: settings } = await supabase.from('scheduling_settings').select('*').maybeSingle();
  if ((settings && settings.agent_enabled === false) || agentState.is_active === false) {
    console.log(`[whatsapp] Agente desabilitado (Global: ${settings?.agent_enabled}, Lead: ${agentState.is_active}). Ignorando resposta para ${jid}.`);
    return new Response('ok', { status: 200 });
  }

  // ── Busca disponibilidade do profissional e conflitos ───
  const { data: availability } = await supabase.from('professional_availability').select('*');
  const { data: booked } = await supabase.from('meetings')
    .select('scheduled_at')
    .in('status', ['scheduled', 'proposed'])
    .gte('scheduled_at', new Date().toISOString());

  let availabilityStr = "";
  if (availability && availability.length > 0) {
    const daysMap = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const bookedTimes = (booked ?? []).map(m => new Date(m.scheduled_at).toISOString());

    // Lista os próximos 14 dias para dar opções ao lead
    for (let i = 0; i <= 14; i++) {
      const d = new Date(nowLocal);
      d.setDate(d.getDate() + i);

      const dayOfWeek = d.getDay();
      const dateISO = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
      const dateStr = d.toLocaleDateString('pt-BR', { timeZone: "America/Sao_Paulo" });

      // Procura slots dessa data específica ou regra semanal
      let rules = availability.filter((a: any) => a.specific_date === dateISO);
      if (rules.length === 0) {
        rules = availability.filter((a: any) => a.day_of_week === dayOfWeek && !a.specific_date);
      }

      if (rules.length > 0) {
        let dayHeaderAdded = false;
        
        for (const rule of rules) {
          const [startH, startM] = rule.start_time.split(':').map(Number);
          const [endH, endM] = rule.end_time.split(':').map(Number);
          
          // Quebra intervalos em slots de 1 hora
          for (let h = startH; h < endH; h++) {
            const slotDate = new Date(d);
            slotDate.setHours(h, startM, 0, 0);
            
            // 1. Verifica se o slot está no passado ou muito próximo (antecedência min 1h)
            if (slotDate.getTime() < nowLocal.getTime() + (60 * 60 * 1000)) {
              continue;
            }

            // 2. Verifica colisão com reuniões já marcadas
            if (bookedTimes.includes(slotDate.toISOString())) {
              continue;
            }

            if (!dayHeaderAdded) {
              const label = i === 0 ? "HOJE" : i === 1 ? "AMANHÃ" : daysMap[dayOfWeek];
              availabilityStr += `\n📅 *${label} (${dateStr})*:\n`;
              dayHeaderAdded = true;
            }
            
            const timeFormatted = String(h).padStart(2, '0') + ":" + String(startM).padStart(2, '0');
            availabilityStr += `- ${timeFormatted}\n`;
          }
        }
      }
    }
  }

  // ── Busca histórico completo (últimas 40 mensagens) ────────
  const { data: historyRaw } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })  // mais recentes primeiro
    .limit(40);

  // Inverte para que a ordem no prompt seja cronológica (mais antigas → mais novas)
  const history = (historyRaw ?? []).reverse();
  console.log(`[agent-context] Enviando ${history.length} mensagens de histórico para a IA.`);

  // ── Gera resposta via agente Gemini ────────────────────
  const agentInput = {
    ...agentState,
    phase: agentState.spin_phase, // mapeia para o novo campo
  };
  let { reply: rawReply, newPhase, spinData, name: collectedName, email: collectedEmail, score, nextStage, notes, schedule } =
    await generateAgentReply(history ?? [], agentInput, lead, availabilityStr);

  // ── Trata agendamento via JSON ou fallback ───────────────
  let reply = rawReply;
  if (schedule && schedule.action === 'book' && schedule.time) {
    // Substitui espaco por T caso a IA envie "2026-04-13 08:00" sem o T
    let safeTime = schedule.time.trim().replace(' ', 'T');
    let parsedDate = new Date(safeTime + ":00-03:00"); // Offset BR

    // Tenta arrumar a data se a IA mandou com barras: "15/04/2026 19:00" ou "15/04 19:00"
    if (isNaN(parsedDate.getTime()) && schedule.time.includes('/')) {
        const [datePart, timePart] = schedule.time.split(' ');
        if (datePart && timePart) {
            const [DD, MM, YYYY] = datePart.split('/');
            const year = (YYYY && YYYY.length === 4) ? YYYY : new Date().getFullYear();
            parsedDate = new Date(`${year}-${MM}-${DD}T${timePart}:00-03:00`);
        }
    }

    try {
      if (isNaN(parsedDate.getTime())) {
        throw new Error("Formato de data inválido gerado pela IA: " + schedule.time);
      }

      // ── INTEGRAÇÃO GOOGLE CALENDAR ──
      let meetLink = '';
      let googleEventId = '';
      
      const leadEmail = collectedEmail || lead.email;
      const leadName = lead.name || jid.split('@')[0];

      if (leadEmail && settings?.google_refresh_token) {
        try {
          console.log(`[google] Iniciando agendamento para ${leadEmail}...`);
          const accessToken = await getAccessToken({
            client_id: settings.google_client_id,
            client_secret: settings.google_client_secret,
            refresh_token: settings.google_refresh_token
          });

          const endDate = new Date(parsedDate.getTime() + 60 * 60 * 1000); // 1h de duração

          const event = await createCalendarEvent(accessToken, {
            summary: `Reunião de Descoberta: ${leadName}`,
            description: `Reunião agendada automaticamente via Ponto Zero CRM.\n\nLead: ${leadName}\nWhatsApp: ${numeric}`,
            start: parsedDate.toISOString(),
            end: endDate.toISOString(),
            attendees: [
              { email: leadEmail, displayName: leadName },
              { email: 'pedrobotelho.fotografia@gmail.com', displayName: 'Pedro Botelho' }
            ]
          });

          meetLink = event.meetLink;
          googleEventId = event.eventId;
          console.log(`[google] Evento criado: ${googleEventId} | Link: ${meetLink}`);
        } catch (gErr: any) {
          console.error(`[google] Falha na API: ${gErr.message}`);
          // Fallback para Jitsi se o Google falhar
        }
      }

      // Fallback para Jitsi caso o Google não tenha sido configurado ou falhou
      if (!meetLink) {
        const meetingId = crypto.randomUUID();
        const meetSlug = `PontoZero-${meetingId.replace(/-/g, '').substring(0, 10).toUpperCase()}`;
        meetLink = `https://meet.jit.si/${meetSlug}`;
        console.log(`[calendar] Fallback para Jitsi: ${meetLink}`);
      }

      const { error: insErr } = await supabase.from('meetings').insert({
        lead_id: leadId,
        scheduled_at: parsedDate.toISOString(),
        meet_link: meetLink,
        google_event_id: googleEventId || null,
        status: 'scheduled',
      });
      if (insErr) throw insErr;

      console.log(`[calendar] Agendamento confirmado para lead ${leadId} em ${parsedDate.toISOString()} | Link: ${meetLink}`);

      // Trunca a mensagem do LLM se houver [REUNIÃO_AGENDADA_AQUI] e substitui
      if (reply.includes('[REUNIÃO_AGENDADA_AQUI]')) {
        reply = reply.replace('[REUNIÃO_AGENDADA_AQUI]', `\nLink da Reunião: ${meetLink}\n`);
      } else {
        // Se a IA esqueceu a tag, forçamos o link no final da mensagem
        reply += `\n\nLink da Reunião: ${meetLink}`;
      }

      // ── Notifica o consultor imediatamente sobre o novo agendamento
      console.log(`[calendar] Verificando consultant_phone para notificação: ${settings?.consultant_phone}`);
      if (settings?.consultant_phone) {
        try {
          const leadName = lead.name || jid.split('@')[0];
          const localDate = parsedDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const consultMsg = `🔔 *Nova Reunião Agendada!*\n\nO lead *${leadName}* acabou de confirmar uma reunião.\n\n📅 *Data:* ${localDate}\n🔗 *Link:* ${meetLink}\n\nConvite enviado para: ${leadEmail || 'E-mail não informado'}`;
          await sendWhatsApp(settings.consultant_phone, consultMsg);
          console.log(`[calendar] Notificação enviada ao consultor ${settings.consultant_phone} sobre o agendamento`);
        } catch (e) {
          console.error(`[calendar] Erro ao notificar consultor sobre a reunião do lead ${leadId}:`, e);
        }
      }
    } catch (err: any) {
      console.error(`[calendar] ERRO CRÍTICO NO AGENDAMENTO:`, err.message);
      // Fallback amigável: se der qualquer erro (data inválida, banco de dados fora), envia link manual
      const BOOKING_URL = Deno.env.get('GOOGLE_CALENDAR_BOOKING_URL') || 'https://calendar.app.google/SG2KftSo31iS7DJy5';
      reply += `\n\n*(Tive um probleminha para gerar sua sala virtual agora, por favor me confirme o horário escolhendo no link abaixo)*\n📅 *Agende sua Reunião:* ${BOOKING_URL}`;
    }

  } else if (schedule && schedule.action === 'cancel') {
    console.log(`[calendar] Lead ${leadId} solicitou cancelamento da reunião.`);
    // Vamos procurar reuniões agendadas pendentes
    const { data: activeMeetings } = await supabase.from('meetings').select('*').eq('lead_id', leadId).eq('status', 'scheduled');
    if (activeMeetings && activeMeetings.length > 0) {
      // Marca como cancelled
      await supabase.from('meetings').update({ status: 'cancelled' }).in('id', activeMeetings.map(m => m.id));
      console.log(`[calendar] Canceladas ${activeMeetings.length} reuniões do lead ${leadId}`);
      // Também vamos notificar o consultor se for possível
      if (settings?.consultant_phone) {
        try {
          const leadName = lead.name || jid.split('@')[0];
          const consultCancelMsg = `⚠️ *Reunião Cancelada!*\nO lead *${leadName}* acabou de desmarcar a reunião via IA.`;
          await sendWhatsApp(settings.consultant_phone, consultCancelMsg);
        } catch (e) { }
      }
    }
  } else {
    // Fallback: Injeta link de agendamento se agente usou a tag genérica ao longo do papo
    const BOOKING_URL = Deno.env.get('GOOGLE_CALENDAR_BOOKING_URL') || 'https://calendar.app.google/SG2KftSo31iS7DJy5';
    const hasBookingTag = rawReply.includes('[ENVIAR_LINK_AGENDAMENTO]');
    reply = rawReply.replace(
      '[ENVIAR_LINK_AGENDAMENTO]',
      `\n\n📅 *Agende sua Reunião de Descoberta (gratuita):*\n${BOOKING_URL}`
    );

    // Se usou a tag, registra na tabela meetings num formato fallback
    if (hasBookingTag) {
      await supabase.from('meetings').insert({
        lead_id: leadId,
        calendar_booking_url: BOOKING_URL,
        status: 'proposed',
      }).select().maybeSingle();
      console.log(`[calendar] Link manual de agendamento enviado para lead ${leadId}`);
    }
  }

  // ── Salva resposta do agente ────────────────────────────
  try {
    const hasKey = !!Deno.env.get('OPENAI_API_KEY');
    console.log(`[agent-debug] Gerando resposta... OpenAI Key presente: ${hasKey}`);
    await saveMessage(leadId, 'assistant', reply);
  } catch (e: any) {
    console.warn(`[whatsapp] Falha ao salvar resposta do agente no histórico: ${e.message}`);
  }

  // ── Atualiza estado do agente (Upsert garante que o estado exista) ──
  // Só resetamos as flags de follow-up se for uma mensagem REAL do usuário (não o gatilho [SISTEMA])
  const isSystemTrigger = userText.startsWith('[SISTEMA]');
  const updatedSpinData = { ...agentState.spin_data, ...spinData };
  
  if (!isSystemTrigger) {
    updatedSpinData.follow_up_level = 0;
    updatedSpinData.silence_followup_sent = false;
  }

  const { error: upsertError } = await supabase.from('agent_state').upsert({
    lead_id: leadId,
    spin_phase: newPhase,
    spin_data: updatedSpinData,
    last_message_at: new Date().toISOString(),
    follow_up_count: (agentState.follow_up_count ?? 0) + 1,
  }, { onConflict: 'lead_id' });


  if (upsertError) {
    console.error(`[whatsapp] Erro ao dar upsert no agent_state: ${upsertError.message}`);
  }

  // ── Atualiza nome do lead se o agente coletou ──────────
  if (collectedName && !lead.name) {
    await supabase.from('leads')
      .update({ name: collectedName })
      .eq('id', leadId);
  }

  // ── Move card no pipeline e Salva Anotações ─────────
  if (nextStage && nextStage !== oldStage) {
    const updatePayload: any = { score, stage_id: nextStage, notes: notes || lead.notes };
    if (collectedEmail) updatePayload.email = collectedEmail;
    await supabase.from('leads').update(updatePayload).eq('id', leadId);

    await logActivity(
      leadId,
      'stage_change',
      `Movido de "${STAGE_NAMES[oldStage]}" → "${STAGE_NAMES[nextStage]}" pelo agente`,
      oldStage,
      nextStage
    );

    console.log(`[pipeline] ${jid}: ${STAGE_NAMES[oldStage]} → ${STAGE_NAMES[nextStage]}`);
  } else {
    // Só atualiza score e notes
    const updatePayload: any = { score, notes: notes || lead.notes };
    if (collectedEmail) updatePayload.email = collectedEmail;
    await supabase.from('leads').update(updatePayload).eq('id', leadId);
  }

  // ── Envia resposta pelo WhatsApp ────────────────────────
  // Prioriza telefone numérico se o JID for um @lid e tivermos o número no lead
  let sendTo = jid;
  if (isLid && lead.phone && !lead.phone.includes('@lid')) {
    sendTo = lead.phone;
  }

  // Verifica se o agente está ativo (Pode ser desativado via CRM)
  if (agentState.is_active === false) {
    console.log(`[whatsapp] Agente desativado para o lead ${lead.id}. Ignorando resposta.`);
    return;
  }

  // Formata o texto Markdown (**) para o negrito nativo do WhatsApp (*)
  const formattedReply = reply.replace(/\*\*/g, '*');

  console.log(`[whatsapp] Respondendo para: ${sendTo} (Original: ${jid}) via instância: ${instanceName}`);
  await sendWhatsApp(sendTo, formattedReply, instanceName);
}
