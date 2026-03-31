// ============================================================
// Edge Function: test-agent
// Simulador do Agente para o Frontend (Playground)
//
// Recebe: { history: [], state: {} }
// Retorna: AgentResult
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { supabase } from '../_shared/db.ts';
import { generateAgentReply } from '../_shared/agent.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { history, state, lead } = await req.json();

    // 1. Busca disponibilidade real para o teste ser fiel
    const { data: availability } = await supabase.from('professional_availability').select('*');
    
    let availabilityStr = "";
    if (availability && availability.length > 0) {
      const daysMap = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      
      for (let i = 1; i <= 14; i++) {
          const d = new Date(nowLocal);
          d.setDate(d.getDate() + i);
          const dayOfWeek = d.getDay();
          const dateISO = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
          const dateStr = d.toLocaleDateString('pt-BR', { timeZone: "America/Sao_Paulo" });

          let availableSlots = availability.filter((a: any) => a.specific_date === dateISO);
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

    // 2. Chama o agente
    const result = await generateAgentReply(
      history || [],
      state || { phase: 'agendamento', follow_up_count: 0, spin_data: {} },
      lead || { id: 'test-lead', name: 'Lead de Teste', phone: '5511999999999' },
      availabilityStr
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[test-agent] Erro:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
