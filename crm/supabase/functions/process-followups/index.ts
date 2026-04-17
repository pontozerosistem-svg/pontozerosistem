import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async () => {
  console.log('[process-followups] Iniciando verificação de inatividade multi-nível...');

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    // Busca estados modificados há mais de 1h e menos de 72h
    // Agora inclui Fase 1 (Primeiro Contato) e Fase 2 (Agendamento de Reunião)
    const { data: agentStates, error } = await supabase
      .from('agent_state')
      .select('*, leads!inner(id, name, stage_id, phone)')
      .lt('last_message_at', oneHourAgo.toISOString())
      .gt('last_message_at', seventyTwoHoursAgo.toISOString())
      .in('leads.stage_id', [1, 2]);

    if (error) {
      throw error;
    }

    if (!agentStates || agentStates.length === 0) {
      console.log('[process-followups] Nenhum lead inativo elegível nas fases 1 e 2.');
      return new Response('Ok', { status: 200 });
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-whatsapp`;
    let processedCount = 0;

    for (const state of agentStates) {
      if (state.is_active === false) continue;

      const leadPhone = (state.leads as any).phone;
      if (!leadPhone) continue;

      const data = state.spin_data || {};
      const followUpLevel = data.follow_up_level || 0;
      const lastMessage = new Date(state.last_message_at);
      const hoursInactive = (now.getTime() - lastMessage.getTime()) / (1000 * 60 * 1000);

      let targetLevel = 0;
      let systemMessage = '';

      // Lógica de Multi-nível de Follow-up
      if (hoursInactive >= 48 && followUpLevel < 3) {
        targetLevel = 3;
        systemMessage = "[SISTEMA]: O lead não responde há mais de 2 dias (48h). Esta é a sua última tentativa de contato antes de encerrarmos o atendimento por enquanto. Seja educado, pergunte se o projeto dele ainda é uma prioridade e se ele quer manter o contato aberto para o futuro.";
      } else if (hoursInactive >= 24 && followUpLevel < 2) {
        targetLevel = 2;
        systemMessage = "[SISTEMA]: O lead não responde há 24 horas. Faça um 'check-in' reforçando o valor da Ponto Zero Consultoria e como podemos ajudá-lo com seu posicionamento de imagem. Mostre que estamos à disposição se ele estiver pronto para seguir.";
      } else if (hoursInactive >= 1 && followUpLevel < 1) {
        // Antiga lógica de 'silence_followup_sent' migrada para Level 1
        if (data.silence_followup_sent === true) {
           // Já enviaram o nível 1 pelo método antigo, pula pro 2 na próxima rodada
           continue; 
        }
        targetLevel = 1;
        systemMessage = "[SISTEMA]: O lead não responde há mais de 1 hora. Pergunte de forma leve e amigável (sem pressão) se ficou alguma dúvida sobre o que conversamos até agora e se ele gostaria de seguir com o atendimento.";
      }

      if (targetLevel > 0) {
        console.log(`[process-followups] Disparando follow-up nível ${targetLevel} para: ${leadPhone}`);

        const payload = {
          event: 'messages.upsert',
          data: {
            message: { conversation: systemMessage },
            key: {
              remoteJid: leadPhone,
              fromMe: false, // Simula o lead para acionar o webhook e a IA responder
              id: `FOLLOWUP_L${targetLevel}_` + Date.now()
            }
          }
        };

        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            // Atualiza o nível no spin_data para não repetir o mesmo nível
            const newSpinData = { 
              ...data, 
              follow_up_level: targetLevel,
              last_followup_at: now.toISOString(),
              silence_followup_sent: true // Mantém compatibility por enquanto
            };
            
            await supabase
              .from('agent_state')
              .update({ spin_data: newSpinData })
              .eq('lead_id', state.lead_id);

            processedCount++;
          }
        } catch(e) {
          console.error(`[process-followups] Falha ao engajar lead ${leadPhone}:`, e);
        }
      }
    }

    return new Response(`Processados ${processedCount} leads.`, { status: 200 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[process-followups] Erro fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});

