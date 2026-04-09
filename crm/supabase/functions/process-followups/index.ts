import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async () => {
  console.log('[process-followups] Iniciando verificação de inatividade...');

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Busca estados modificados há mais de 1h e menos de 24h
    const { data: agentStates, error } = await supabase
      .from('agent_state')
      .select('*, leads!inner(id, stage_id, phone)')
      .lt('last_message_at', oneHourAgo.toISOString())
      .gt('last_message_at', twentyFourHoursAgo.toISOString())
      .eq('leads.stage_id', 1);

    if (error) {
      throw error;
    }

    if (!agentStates || agentStates.length === 0) {
      console.log('[process-followups] Nenhum lead inativo na fase 1.');
      return new Response('Ok', { status: 200 });
    }

    // Filtrar os que já receberam o followup de silêncio
    const toProcess = agentStates.filter((state: any) => {
      const data = state.spin_data || {};
      return data.silence_followup_sent !== true && state.is_active !== false;
    });

    console.log(`[process-followups] Encontrados ${toProcess.length} leads elegíveis.`);

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-whatsapp`;

    for (const state of toProcess) {
       const leadPhone = (state.leads as any).phone;
       if (!leadPhone) continue;

       console.log(`[process-followups] Disparando follow-up para: ${leadPhone}`);

       // Dispara webhook fake de reinício (injeta comando direto do sistema mascarado como mensagem)
       // Vamos mandar um gatilho escondido que a agente precisa seguir
       const payload = {
        event: 'messages.upsert',
        data: {
          message: {
            // Em index.ts ele verá isso. Precisaremos que a IA seja "acordada"
            conversation: "[SISTEMA]: O lead não responde há mais de 1 hora. Pergunte de forma leve e amigável (sem pressão) se ficou alguma dúvida e se ele gostaria de seguir nossa conversa."
          },
          key: {
            remoteJid: leadPhone,
            fromMe: false, // Simula o lead para acionar o webhook
            id: 'FOLLOWUP_' + Date.now()
          }
        }
      };

      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // Marca que enviamos
        const newSpinData = { ...state.spin_data, silence_followup_sent: true };
        await supabase
          .from('agent_state')
          .update({ spin_data: newSpinData })
          .eq('lead_id', state.lead_id);

      } catch(e) {
        console.error(`Falha ao engajar lead ${leadPhone}:`, e);
      }
    }

    return new Response(`Processado ${toProcess.length} leads.`, { status: 200 });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[process-followups] Erro fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
