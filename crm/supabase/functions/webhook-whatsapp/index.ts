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

    const audioMsg = msg?.audioMessage;

    if (audioMsg && messageId && jid) {
      console.log(`[whatsapp] Áudio detectado de ${jid}. Processando em background.`);
      const audioWork = (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const base64 = await getAudioBase64(messageId, jid);
          if (base64) {
            const text = await transcribeAudio(base64);
            if (text) {
              console.log(`[transcription] ${jid}: ${text}`);
              await processMessage(jid, `[Áudio]: ${text}`, instanceName);
            }
          }
        } catch (e: any) {
          console.error('[audio] Erro no processamento:', e.message);
        }
      })();

      // Registrar trabalho em background no Edge Runtime
      // @ts-ignore
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(audioWork);
      }

      return new Response('ok', { status: 200 });
    }

    const text =
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption;

    if (jid && text) {
      // IMPORTANTE: Await aqui para garantir que a função não feche prematuramente
      console.log(`[webhook-whatsapp] Chamando processMessage para ${jid} e AGUARDANDO...`);
      await processMessage(jid, text, instanceName);
    }

    return new Response('ok', { status: 200 });

  } catch (err: any) {
    console.error('[webhook-whatsapp] Erro crítico no handler:', err.message);
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

  // 1. Match exato por JID
  let { data: lead } = await supabase
    .from('leads')
    .select('*, agent_state(*)')
    .eq('phone', jid)
    .maybeSingle();

  // 2. Match numérico — APENAS para @s.whatsapp.net (ou extraído de @lid via normalizeJid)
  if (!lead) {
    if (numeric.length >= 10) {
      const { data: leadByNumbers } = await supabase
        .from('leads')
        .select('*, agent_state(*)')
        .eq('phone', numeric)
        .maybeSingle();
      
      if (leadByNumbers) {
        lead = leadByNumbers;
        console.log(`[whatsapp] Vinculando JID ${jid} ao lead numérico ${numeric}`);
        await supabase.from('leads').update({ phone: jid }).eq('id', lead.id);
      }
    }
  }

  // 3. Match por LID salvo em metadata.known_lids
  if (!lead && isLid) {
    const { data: leadByLid } = await supabase
      .from('leads')
      .select('*, agent_state(*)')
      .contains('metadata', { known_lids: [jid] })
      .maybeSingle();
    if (leadByLid) {
      lead = leadByLid;
      console.log(`[whatsapp] Lead encontrado via metadata known_lids: ${jid}`);
    }
  }

  // 4. Se não é @lid, busca em metadata.known_numbers
  if (!lead && !isLid) {
    if (numeric.length >= 10) {
      const { data: leadByMeta } = await supabase
        .from('leads')
        .select('*, agent_state(*)')
        .contains('metadata', { known_numbers: [numeric] })
        .maybeSingle();
      if (leadByMeta) {
        lead = leadByMeta;
        console.log(`[whatsapp] Lead encontrado via metadata known_numbers: ${numeric}`);
        await supabase.from('leads').update({ phone: jid }).eq('id', lead.id);
      }
    }
  }

  if (!lead) {
    console.warn(`[whatsapp] Lead NÃO IDENTIFICADO para: ${numeric}. (JID: ${jid}). Ignorando mensagem.`);
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

  // ── Busca disponibilidade do profissional ───────────────
  const { data: availability } = await supabase.from('professional_availability').select('*');
  let availabilityStr = "";
  if (availability && availability.length > 0) {
    const daysMap = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

    // Lista os próximos 14 dias para dar opções ao lead
    for (let i = 0; i <= 14; i++) {
      const d = new Date(nowLocal);
      d.setDate(d.getDate() + i);

      const dayOfWeek = d.getDay();
      const dateISO = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
      const dateStr = d.toLocaleDateString('pt-BR', { timeZone: "America/Sao_Paulo" });

      // Procura slots fixos dessa data específica primeiro
      let availableSlots = availability.filter((a: any) => a.specific_date === dateISO);

      // Se não tiver data específica, pega regra semanal
      if (availableSlots.length === 0) {
        availableSlots = availability.filter((a: any) => a.day_of_week === dayOfWeek && !a.specific_date);
      }

      if (availableSlots.length > 0) {
        for (const slot of availableSlots) {
          // Se for hoje, filtra os horários que já passaram
          if (i === 0) {
            const currentHour = nowLocal.getHours();
            const currentMinute = nowLocal.getMinutes();
            const [slotHour, slotMinute] = slot.start_time.split(':').map(Number);
            if (slotHour < currentHour || (slotHour === currentHour && slotMinute <= currentMinute)) {
              continue; // Ignora slots passados hoje
            }
          }
          availabilityStr += `${daysMap[dayOfWeek]} (${dateStr}) das ${slot.start_time.substring(0, 5)} às ${slot.end_time.substring(0, 5)}\n`;
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
  const { reply: rawReply, newPhase, spinData, score, nextStage, notes, schedule } =
    await generateAgentReply(history ?? [], agentInput, lead, availabilityStr);

  // ── Trata agendamento via JSON ou fallback ───────────────
  let reply = rawReply;
  if (schedule && schedule.action === 'book' && schedule.time) {
    // Tenta fazer o parse da data normalmente (escrúpulo: "2026-04-15 19:00")
    let parsedDate = new Date(schedule.time + ":00-03:00"); // Offset BR

    // Tenta arrumar a data se a IA mandou algo "quebrado" como "15/04 19:00" em vez de "2026-04-15 19:00"
    if (isNaN(parsedDate.getTime()) && schedule.time.includes('/')) {
        const [datePart, timePart] = schedule.time.split(' ');
        if (datePart && timePart) {
            const [DD, MM] = datePart.split('/');
            const year = new Date().getFullYear();
            // Refaz o parse com padrão ISO aceitável
            parsedDate = new Date(`${year}-${MM}-${DD}T${timePart}:00-03:00`);
        }
    }

    try {
      if (isNaN(parsedDate.getTime())) {
        throw new Error("Formato de data inválido gerado pela IA: " + schedule.time);
      }

      // Gera link Jitsi único (sem API key)
      const meetingId = crypto.randomUUID();
      const meetSlug = `PontoZero-${meetingId.replace(/-/g, '').substring(0, 10).toUpperCase()}`;
      const meetLink = `https://meet.jit.si/${meetSlug}`;

      const { error: insErr } = await supabase.from('meetings').insert({
        id: meetingId,
        lead_id: leadId,
        scheduled_at: parsedDate.toISOString(),
        meet_link: meetLink,
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
          const consultMsg = `🔔 *Nova Reunião Agendada!*\n\nO lead *${leadName}* acabou de confirmar uma reunião com a IA.\n\n📅 *Data:* ${localDate}\n🔗 *Link Jitsi:* ${meetLink}\n\nEntre no link no horário marcado!`;
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
  const { error: upsertError } = await supabase.from('agent_state').upsert({
    lead_id: leadId,
    spin_phase: newPhase,
    spin_data: { ...agentState.spin_data, ...spinData },
    last_message_at: new Date().toISOString(),
    follow_up_count: (agentState.follow_up_count ?? 0) + 1,
  }, { onConflict: 'lead_id' });

  if (upsertError) {
    console.error(`[whatsapp] Erro ao dar upsert no agent_state: ${upsertError.message}`);
  }

  // ── Atualiza nome do lead se o agente coletou ──────────
  if ((spinData as any)?.nome && !lead.name) {
    await supabase.from('leads')
      .update({ name: (spinData as any).nome })
      .eq('id', leadId);
  }

  // ── Move card no pipeline e Salva Anotações ─────────
  if (nextStage && nextStage !== oldStage) {
    await supabase.from('leads')
      .update({ score, stage_id: nextStage, notes: notes || lead.notes })
      .eq('id', leadId);

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
    await supabase.from('leads').update({ score, notes: notes || lead.notes }).eq('id', leadId);
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
