// ============================================================
// Edge Function: test-agent (Ultra Robust Debug Version)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateAgentReply } from '../_shared/agent.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[test-agent] Chamada recebida...')
    
    // 2. Extrai Payload
    let payload
    try {
      payload = await req.json()
    } catch (e) {
      console.error('[test-agent] Erro ao ler JSON:', e)
      return new Response(JSON.stringify({ error: 'Payload JSON inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { history, state, lead } = payload
    console.log('[test-agent] Inputs:', { h: history?.length, p: state?.phase })

    // 3. Verifica OpenAI Key (Obrigatória para funcionar)
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      console.error('[test-agent] ERRO: OPENAI_API_KEY não encontrada nos secrets.')
      return new Response(JSON.stringify({ 
        reply: "🚨 ERRO CRÍTICO: Você precisa configurar a 'OPENAI_API_KEY' nos Secrets do Supabase antes de testar.",
        error: "Missing API Key"
      }), {
        status: 200, // Retornamos 200 amigável
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Busca Disponibilidade (Opcional, com fallback)
    let availabilityStr = ""
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data: availability } = await supabase.from('professional_availability').select('*')
        
        if (availability && availability.length > 0) {
          const daysMap = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
          const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
          
          for (let i = 0; i <= 14; i++) {
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
                      if (i === 0) {
                          const currentHour = nowLocal.getHours();
                          const currentMinute = nowLocal.getMinutes();
                          const [slotHour, slotMinute] = slot.start_time.split(':').map(Number);
                          if (slotHour < currentHour || (slotHour === currentHour && slotMinute <= currentMinute)) {
                              continue;
                          }
                      }
                      availabilityStr += `${daysMap[dayOfWeek]} (${dateStr}) das ${slot.start_time.substring(0, 5)} às ${slot.end_time.substring(0, 5)}\n`;
                  }
              }
          }
        }
      }
    } catch (e) {
      console.warn('[test-agent] Ignorando erro de busca de disponibilidade no teste:', e)
    }

    // 5. Gera Resposta
    console.log('[test-agent] Chamando generateAgentReply...')
    const result = await generateAgentReply(
      history || [],
      state || { phase: 'agendamento', follow_up_count: 0, spin_data: {} },
      lead || { id: 'test-lead', name: 'Lead de Teste', phone: '5511999999999' },
      availabilityStr
    )

    console.log('[test-agent] Sucesso!')
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[test-agent] ERRO FATAL:', err)
    return new Response(JSON.stringify({ 
      error: err.message,
      stack: err.stack,
      reply: "💥 Ocorreu um erro interno na Edge Function. Verifique os logs no Dashboard do Supabase."
    }), {
      status: 200, // Forçamos 200 para ver o erro no front
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
