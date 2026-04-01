// ============================================================
// Edge Function: webhook-whatsapp
// Recebe mensagens da Evolution API (WhatsApp)
//
// URL configurada na Evolution:
// POST /functions/v1/webhook-whatsapp
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase, saveMessage, logActivity } from '../_shared/db.ts';
import { sendWhatsApp }                       from '../_shared/evolution.ts';
import { generateAgentReply }                 from '../_shared/agent.ts';
import { STAGES, STAGE_NAMES }               from '../_shared/stages.ts';
import { getAudioBase64, transcribeAudio }    from '../_shared/audio.ts';



Deno.serve(async (req: Request) => {
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
    const rawBody = await req.text();
    if (!rawBody) {
      console.warn('[webhook-whatsapp] Body vazio recebido.');
      return new Response('ok', { status: 200 });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
      console.log(`[DEBUG-RAW] Evento: ${event.event || event.type} | Instance: ${event.instance}`);
      // Log completo do payload para debugar campos ausentes
      console.log('[DEBUG-PAYLOAD]:', JSON.stringify(event, null, 2));
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
    const rawJid  = dataObj.key?.remoteJid || dataObj.remoteJid || event.sender;
    const messageId = dataObj.key?.id || dataObj.id;
    
    if (!rawJid) {
       console.warn('[webhook-whatsapp] remoteJid não encontrado no payload.');
       return new Response('ok', { status: 200 });
    }

    if (!rawJid) {
       console.warn('[webhook-whatsapp] remoteJid ausente no evento.');
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
      jid.includes('553899273737') || // Ignora o próprio número do agente Ponto Zero
      jid === '553899273737@s.whatsapp.net'
    ) {
      console.log(`[whatsapp] Mensagem ignorada (sistema/próprio agente): ${jid}`);
      return new Response('ok', { status: 200 });
    }

    const audioMsg = msg?.audioMessage;
    
    if (audioMsg && messageId && jid) {
      console.log(`[whatsapp] Áudio detectado de ${jid} (Instância: ${instanceName})`);
      (async () => {
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
      })().catch(err => console.error('[audio] Erro fatal:', err));
      return new Response('ok', { status: 200 });
    }

    const text =
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption;

    if (jid && text) {
      processMessage(jid, text, instanceName).catch(err =>
        console.error('[webhook-whatsapp] Erro no processamento:', err)
      );
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
  if (!rawJid) return '';

  // Remove sufixos de dispositivo (ex: 5531...:30@s.whatsapp.net -> 5531...@s.whatsapp.net)
  let cleanJid = rawJid.split(':')[0];
  if (!cleanJid.includes('@')) {
    cleanJid = cleanJid + (rawJid.includes('@lid') ? '@lid' : '@s.whatsapp.net');
  }

  if (!cleanJid.includes('@lid')) return cleanJid;

  // Candidatos de campos que podem conter o número real em formato @s.whatsapp.net
  const candidates: any[] = [
    event?.sender,                          // campo sender no nível do evento
    dataObj?.sender,                        // campo sender no data
    dataObj?.participant,                   // em grupos, o participant tem o número real
    dataObj?.phoneNumber,                   // algumas versões da Evolution
    dataObj?.contact?.id,                   // campo de contato
    dataObj?.key?.participant,              // participant dentro da key
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === 'string' && 
      candidate.includes('@s.whatsapp.net') &&
      !candidate.includes('553186460883') && // antigo número do agente
      !candidate.includes('5538999273737')   // novo número do agente Ponto Zero
    ) {
      return candidate;
    }
  }

  // Nenhum campo com @s.whatsapp.net encontrado — loga para diagnóstico
  return rawJid; // retorna @lid original como fallback
}

// ============================================================
// CORE — Processa mensagem recebida
// ============================================================
async function processMessage(jid: string, userText: string, instanceName?: string) {
  const isLid = jid.includes('@lid');
  const numeric = jid.replace(/\D/g, '');

  console.log(`[whatsapp] Nova mensagem | JID: ${jid} | Instância: ${instanceName} | Texto: ${userText.substring(0, 30)}`);

  // 1. Match exato por JID (Telefone ou ID completo)
  let { data: lead, error: matchError } = await supabase
    .from('leads')
    .select('*, agent_state(*)')
    .eq('phone', jid)
    .maybeSingle();

  if (matchError) {
    console.error(`[whatsapp] Erro ao buscar lead por JID (${jid}):`, matchError.message);
  }

  if (lead) {
    console.log(`[whatsapp] Lead encontrado por JID exato: ${lead.name || 'Sem nome'} (ID: ${lead.id})`);
  }

  // 2. Match numérico inteligente — APENAS para números reais
  if (!lead && !isLid && numeric.length >= 10) {
    console.log(`[whatsapp] Match exato não encontrado para ${jid}. Tentando variações...`);
    
    // Lista de variações para busca (com/sem 55, com/sem o 9 extra)
    let searchNumbers = [numeric];
    
    // Se for brasileiro (55xxx...)
    if (numeric.startsWith('55')) {
      if (numeric.length === 13) {
        // Tem o 9 extra, adiciona versão SEM o 9: 55 + DDD + Resto
        searchNumbers.push(numeric.substring(0, 4) + numeric.substring(5));
      } else if (numeric.length === 12) {
        // NÃO tem o 9, adiciona versão COM o 9: 55 + DDD + 9 + Resto
        searchNumbers.push(numeric.substring(0, 4) + '9' + numeric.substring(4));
      }
      
      // Adiciona também versão sem o DDI 55 (apenas DDD + número)
      searchNumbers.push(numeric.substring(2)); 
    }

    const { data: fuzzyLeads, error: fuzzyError } = await supabase
      .from('leads')
      .select('*, agent_state(*)')
      .in('phone', searchNumbers);

    if (fuzzyError) {
      console.error('[whatsapp] Erro na busca numérica fuzzy:', fuzzyError.message);
    }

    if (fuzzyLeads && fuzzyLeads.length > 0) {
      lead = fuzzyLeads[0];
      console.log(`[whatsapp] Lead encontrado via busca numérica: ${lead.name} (ID: ${lead.id})`);
      // Atualiza o JID oficial no banco para futuras consultas serem rápidas
      await supabase.from('leads').update({ phone: jid }).eq('id', lead.id);
    } else {
      console.log(`[whatsapp] Nenhuma das variações funcionou: ${searchNumbers.join(', ')}`);
    }
  }

  if (!lead) {
    console.warn(`[whatsapp] Lead não identificado para o JID: ${jid}. Mensagem ignorada.`);
    return;
  }

  // 3. Match por LID salvo em metadata
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
    const numeric = jid.replace(/\D/g, '');
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

  // 5. HEURÍSTICA PARA @lid SEM MATCH:
  //    Quando a primeira resposta de um lead da landing page chega como @lid,
  //    ainda não há mapeamento. Buscamos um lead da landing page criado nas
  //    últimas 48h que ainda não recebeu nenhuma mensagem do usuário
  //    (apenas a mensagem de boas-vindas foi enviada pelo agente).
  if (!lead && isLid) {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: candidateLeads } = await supabase
      .from('leads')
      .select('id, name, phone, stage_id, score, notes, metadata, source, agent_state!inner(spin_phase, spin_data, follow_up_count)')
      .not('phone', 'like', '%@lid%')  // excluir leads que já são @lid
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    // Filtra candidatos sem nenhuma mensagem de usuário ainda
    const awaitingReply = (candidateLeads ?? []).filter(cl => {
      const followUp = (cl as any).agent_state?.[0]?.follow_up_count ?? 0;
      return followUp <= 1; // apenas a mensagem de boas-vindas foi enviada
    });

    if (awaitingReply.length === 1) {
      lead = awaitingReply[0];
      console.log(`[whatsapp] @lid ${jid} vinculado à landing page lead ${lead.id} (heurística)`);
      // Salva o LID nos metadados para futuros matches
      const currentMeta = (lead as any).metadata || {};
      const knownLids   = currentMeta.known_lids || [];
      if (!knownLids.includes(jid)) {
        await supabase.from('leads')
          .update({ metadata: { ...currentMeta, known_lids: [...knownLids, jid] } })
          .eq('id', lead.id);
      }
    } else if (awaitingReply.length > 1) {
      console.warn(`[whatsapp] @lid ${jid}: ${awaitingReply.length} candidatos — não é possível determinar o lead correto automaticamente.`);
    }
  }

  if (!lead) {
    // Lead novo — veio direto pelo WhatsApp (sem passar pela landing page)
    const { data: newLead } = await supabase
      .from('leads')
      .insert({
        phone:    jid,
        source:   'whatsapp_inbound',
        stage_id: STAGES.PRIMEIRO_CONTATO,
      })
      .select('id')
      .single();

    await supabase.from('agent_state').insert({
      lead_id:    newLead!.id,
      spin_phase: 'agendamento',
      spin_data:  {},
      follow_up_count: 0
    });

    await logActivity(newLead!.id, 'stage_change', 'Lead criado via WhatsApp direto', null, STAGES.PRIMEIRO_CONTATO);

    lead = {
      ...newLead,
      stage_id:    STAGES.PRIMEIRO_CONTATO,
      agent_state: [{ spin_phase: 'agendamento', spin_data: {}, follow_up_count: 0 }],
    };

    console.log(`[whatsapp] Novo lead criado via WhatsApp direto: ${jid}`);
  }

  const leadId     = lead.id;
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
  await saveMessage(leadId, 'user', userText);

  // ── Verifica configurações do agente (Global e por Lead) ────────
  const { data: settings } = await supabase.from('scheduling_settings').select('agent_enabled').maybeSingle();
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
    for (let i = 1; i <= 14; i++) {
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
      // Se a IA decidiu agendar um horário
      const parsedDate = new Date(schedule.time + ":00-03:00"); // Offset BR

      // Gera link Jitsi único (sem API key)
      const meetingId  = crypto.randomUUID();
      const meetSlug   = `PontoZero-${meetingId.replace(/-/g, '').substring(0, 10).toUpperCase()}`;
      const meetLink   = `https://meet.jit.si/${meetSlug}`;

      await supabase.from('meetings').insert({
        id: meetingId,
        lead_id: leadId,
        scheduled_start: parsedDate.toISOString(),
        meet_link: meetLink,
        status: 'scheduled',
      });

      console.log(`[calendar] Agendamento confirmado para lead ${leadId} em ${parsedDate.toISOString()} | Link: ${meetLink}`);

      // Trunca a mensagem do LLM se houver [REUNIÃO_AGENDADA_AQUI] e substitui
      if (reply.includes('[REUNIÃO_AGENDADA_AQUI]')) {
         reply = reply.replace('[REUNIÃO_AGENDADA_AQUI]', `\nLink da Reunião: ${meetLink}\n`);
      }

      // ── Notifica o consultor imediatamente sobre o novo agendamento
      console.log(`[calendar] Verificando consultant_phone para notificação: ${settings?.consultant_phone}`);
      if (settings?.consultant_phone) {
        try {
          const leadName = lead.name || jid.split('@')[0];
          const localDate = parsedDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const consultMsg = `🔔 *Nova Reunião Agendada!*\n\nO lead *${leadName}* acabou de confirmar uma reunião com a IA.\n\n📅 *Data:* ${localDate}\n🔗 *Link Jitsi:* ${meetLink}\n\nEntre no link no horário marcado!`;
          await sendWhatsApp(settings.consultant_phone, consultMsg);
          console.log(`[calendar] Notificação enviada ao consultor ${settings.consultant_phone} sobre o agendamento do lead ${leadId}`);
        } catch (e) {
          console.error(`[calendar] Erro ao notificar consultor sobre a reunião do lead ${leadId}:`, e);
        }
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
           } catch (e) {}
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
  await saveMessage(leadId, 'assistant', reply);

  // ── Atualiza estado do agente (Upsert garante que o estado exista) ──
  const { error: upsertError } = await supabase.from('agent_state').upsert({
    lead_id:         leadId,
    spin_phase:      newPhase,
    spin_data:       { ...agentState.spin_data, ...spinData },
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

  console.log(`[whatsapp] Respondendo para: ${sendTo} (Original: ${jid}) via instância: ${instanceName}`);
  await sendWhatsApp(sendTo, reply, instanceName);
}
