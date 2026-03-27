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



serve(async (req) => {
  console.log(`[webhook-whatsapp] Request: ${req.method} ${req.url}`);
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  try {
    const rawBody = await req.text();
    console.log('[webhook-whatsapp] Raw Body:', rawBody);
    
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      console.error('[webhook-whatsapp] Falha ao parsear JSON:', e.message);
      return new Response('ok', { status: 200 });
    }

    if (event.event !== 'messages.upsert' && event.event !== 'MESSAGES_UPSERT') {
      console.log('[webhook-whatsapp] Ignorando evento não suportado:', event.event);
      return new Response('ok', { status: 200 });
    }

    const dataObj = event.data;
    if (!dataObj || !dataObj.key || !dataObj.message) {
      return new Response('ok', { status: 200 });
    }

    if (dataObj.key.fromMe) return new Response('ok', { status: 200 });

    const rawJid   = dataObj.key.remoteJid;
    const msg      = dataObj.message;
    const messageId = dataObj.key.id;

    // ── Normaliza @lid → @s.whatsapp.net ─────────────────────────────────────
    // A Evolution API pode enviar @lid em vez do número real quando o WhatsApp
    // usa o novo sistema de privacidade LID. Tentamos recuperar o número real
    // de outros campos do payload antes de processar.
    const jid = normalizeJid(rawJid, event, dataObj);
    if (rawJid !== jid) {
      console.log(`[whatsapp] JID normalizado: ${rawJid} → ${jid}`);
    }

    // ── Filtra Grupos, Comunidades e o próprio Agente ───────────────────────
    if (
      jid.includes('@g.us') || 
      jid.includes('@broadcast') || 
      jid.includes('newsletter') ||
      jid.includes('553186460883') // Ignora o próprio número do agente
    ) {
      console.log(`[whatsapp] Ignorando mensagem de grupo/comunidade/próprio agente: ${jid}`);
      return new Response('ok', { status: 200 });
    }

    const audioMsg = msg?.audioMessage;
    
    if (audioMsg && messageId && jid) {
      console.log(`[whatsapp] Áudio detectado de ${jid}`);
      (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const base64 = await getAudioBase64(messageId, jid);
          if (base64) {
            const text = await transcribeAudio(base64);
            if (text) {
              console.log(`[transcription] ${jid}: ${text}`);
              await processMessage(jid, `[Áudio]: ${text}`);
            } else {
              console.error(`[audio] ${jid}: Não consegui transcrever o áudio.`);
            }
          }
        } catch (e: any) {
          console.error('[audio] Erro no processamento:', e);
        }
      })().catch(err => console.error('[audio] Erro não capturado:', err));
      return new Response('ok', { status: 200 });
    }

    const text =
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption;

    if (!jid || !text) return new Response('ok', { status: 200 });

    processMessage(jid, text).catch(err =>
      console.error('[webhook-whatsapp] Erro no processamento:', err)
    );

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[webhook-whatsapp] Erro ao parsear evento:', err);
    return new Response('ok', { status: 200 });
  }
});

// ============================================================
// NORMALIZA JID — converte @lid para @s.whatsapp.net quando possível
// A Evolution inclui o número real em campos como: sender, participant,
// phoneNumber, contact.id, ou remoteJid de outros eventos.
// ============================================================
function normalizeJid(rawJid: string, event: any, dataObj: any): string {
  if (!rawJid || !rawJid.includes('@lid')) return rawJid; // não é @lid, retorna como está

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
async function processMessage(jid: string, userText: string) {
  const isLid = jid.includes('@lid');

  // 1. Match exato por JID
  let { data: lead } = await supabase
    .from('leads')
    .select('*, agent_state(*)')
    .eq('phone', jid)
    .maybeSingle();

  // 2. Match numérico — APENAS para @s.whatsapp.net (nunca para @lid, que não é número)
  if (!lead && !isLid) {
    const numeric = jid.replace(/\D/g, '');
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
        stage_id: STAGES.NOVO_LEAD,
      })
      .select('id')
      .single();

    await supabase.from('agent_state').insert({
      lead_id:    newLead!.id,
      spin_phase: 'agendamento',
      spin_data:  {},
      follow_up_count: 0
    });

    await logActivity(newLead!.id, 'stage_change', 'Lead criado via WhatsApp direto', null, STAGES.NOVO_LEAD);

    lead = {
      ...newLead,
      stage_id:    STAGES.NOVO_LEAD,
      agent_state: [{ spin_phase: 'agendamento', spin_data: {}, follow_up_count: 0 }],
    };

    console.log(`[whatsapp] Novo lead criado via WhatsApp direto: ${jid}`);
  }

  const leadId     = lead.id;
  const oldStage   = lead.stage_id ?? STAGES.NOVO_LEAD;
  const agentState = lead.agent_state?.[0] ?? {
    spin_phase: 'situacao',
    spin_data: {},
    follow_up_count: 0,
  };

  console.log(`[whatsapp] Lead ID: ${leadId}, Phase: ${agentState.spin_phase}, Count: ${agentState.follow_up_count}`);
  if (!lead.agent_state || lead.agent_state.length === 0) {
    console.warn(`[whatsapp] Agent state NÃO encontrado para lead ${leadId} via join - usando default.`);
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

  // ── Busca histórico completo (últimas 40 mensagens) ────────
  const { data: historyRaw } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })  // mais recentes primeiro
    .limit(40);

  // Inverte para que a ordem no prompt seja cronológica (mais antigas → mais novas)
  const history = (historyRaw ?? []).reverse();

  // ── Gera resposta via agente Gemini ────────────────────
  const agentInput = {
    ...agentState,
    phase: agentState.spin_phase, // mapeia para o novo campo
  };
  const { reply: rawReply, newPhase, spinData, score, nextStage, notes } =
    await generateAgentReply(history ?? [], agentInput, lead);

  // ── Injeta link de agendamento se agente propôs reunião ─
  const BOOKING_URL = Deno.env.get('GOOGLE_CALENDAR_BOOKING_URL') || 'https://calendar.app.google/SG2KftSo31iS7DJy5';
  const hasBookingTag = rawReply.includes('[ENVIAR_LINK_AGENDAMENTO]');
  const reply = rawReply.replace(
    '[ENVIAR_LINK_AGENDAMENTO]',
    `\n\n📅 *Agende sua Reunião de Descoberta (gratuita):*\n${BOOKING_URL}`
  );

  // Se usou a tag, registra na tabela meetings
  if (hasBookingTag) {
    await supabase.from('meetings').insert({
      lead_id: leadId,
      calendar_booking_url: BOOKING_URL,
      status: 'proposed',
    }).select().maybeSingle();
    console.log(`[calendar] Link de agendamento enviado para lead ${leadId}`);
  }

  // ── Salva resposta do agente ────────────────────────────
  await saveMessage(leadId, 'assistant', reply);

  // ── Atualiza estado do agente ───────────────────────────
  await supabase.from('agent_state').update({
    spin_phase:     newPhase,
    spin_data:      { ...agentState.spin_data, ...spinData },
    last_message_at: new Date().toISOString(),
    follow_up_count: (agentState.follow_up_count ?? 0) + 1,
  }).eq('lead_id', leadId);

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
  // Quando a mensagem chega por @lid, usamos o telefone real do lead para responder.
  // A Evolution API não aceita @lid como destinatário, somente @s.whatsapp.net ou número.
  const sendTo = (isLid && lead.phone && !lead.phone.includes('@lid'))
    ? lead.phone
    : jid;
  await sendWhatsApp(sendTo, reply);
}
