import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

serve(async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: states } = await supabase.from('agent_state').select('*, leads!inner(*)').eq('is_active', true).lt('last_message_at', oneHourAgo).in('leads.stage_id', [1, 2]);

    if (!states?.length) return new Response('Ninguém para processar', { status: 200 });

    const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-whatsapp`;
    for (const state of states.slice(0, 10)) {
       await fetch(webhookUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_KEY}` 
          },
          body: JSON.stringify({
            event: 'messages.upsert',
            data: { 
              message: { conversation: '[SISTEMA]: Lead silencioso. Pergunte se ficou alguma dúvida.' }, 
              key: { remoteJid: state.leads.phone, fromMe: false, id: `FUP_${Date.now()}` } 
            }
          })
       });
       await supabase.from('agent_state').update({ last_message_at: new Date().toISOString() }).eq('id', state.id);
    }
    return new Response('Processado', { status: 200 });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
});
